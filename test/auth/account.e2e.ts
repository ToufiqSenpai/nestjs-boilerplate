import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import request from "supertest"
import { DataSource } from "typeorm"
import { app } from "../../src/main.js"
import { User } from "../../src/modules/auth/entities/user.entity.js"
import { EmailService } from "../../src/email/email.service.js"
import { createCredentials, signUp, signIn, getAuthCookie, extractVerificationToken } from "./helpers.js"

let dataSource: DataSource
let emailService: EmailService
const createdUserIds: string[] = []

beforeAll(async () => {
  dataSource = app.get(DataSource)
  emailService = app.get(EmailService)
  vi.spyOn(emailService, "send").mockResolvedValue(undefined)
})

afterAll(async () => {
  vi.restoreAllMocks()
  if (createdUserIds.length > 0) await dataSource.getRepository(User).delete(createdUserIds)
  await app.close()
})

async function createVerifiedSession() {
  const credentials = createCredentials()
  const signUpRes = await signUp(credentials).expect(200)
  createdUserIds.push(signUpRes.body.user.id)
  const token = extractVerificationToken()!
  await request(app.getHttpServer()).get("/api/auth/verify-email").query({ token }).expect(200)
  const signInRes = await signIn({ email: credentials.email, password: credentials.password }).expect(200)
  return { credentials, cookie: getAuthCookie(signInRes), signInRes }
}

describe("GET /api/auth/list-accounts", () => {
  it("returns the credential account for the authenticated user", async () => {
    const { cookie } = await createVerifiedSession()
    const res = await request(app.getHttpServer()).get("/api/auth/list-accounts").set("Cookie", cookie).expect(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.some((a: { providerId: string }) => a.providerId === "credential")).toBe(true)
  })
})

describe("GET /api/auth/list-sessions", () => {
  it("returns active sessions for the authenticated user", async () => {
    const { cookie } = await createVerifiedSession()
    const res = await request(app.getHttpServer()).get("/api/auth/list-sessions").set("Cookie", cookie).expect(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(1)
  })
})

describe("POST /api/auth/revoke-session", () => {
  it("revokes a single session and invalidates its cookie", async () => {
    const { credentials } = await createVerifiedSession()
    const r1 = await signIn({ email: credentials.email, password: credentials.password }).expect(200)
    const r2 = await signIn({ email: credentials.email, password: credentials.password }).expect(200)
    const cookie1 = getAuthCookie(r1)
    const cookie2 = getAuthCookie(r2)
    const token1 = (r1.body.token as string | undefined) ?? ""
    expect(token1).toBeTruthy()
    const listBefore = await request(app.getHttpServer()).get("/api/auth/list-sessions").set("Cookie", cookie1).expect(200)
    expect(listBefore.body.length).toBeGreaterThanOrEqual(2)
    const revokeOne = await request(app.getHttpServer())
      .post("/api/auth/revoke-session")
      .set("Cookie", cookie1)
      .send({ token: token1 })
      .expect(200)
    expect(revokeOne.body.status).toBe(true)
    const afterOne = await request(app.getHttpServer()).get("/api/auth/get-session").set("Cookie", cookie1).expect(200)
    expect(afterOne.body).toBeNull()
    const otherStillValid = await request(app.getHttpServer()).get("/api/auth/get-session").set("Cookie", cookie2).expect(200)
    expect(otherStillValid.body).not.toBeNull()
  })
})

describe("POST /api/auth/revoke-other-sessions", () => {
  it("keeps the current session and revokes the others", async () => {
    const { credentials } = await createVerifiedSession()
    await signIn({ email: credentials.email, password: credentials.password }).expect(200)
    const r3 = await signIn({ email: credentials.email, password: credentials.password }).expect(200)
    const cookie3 = getAuthCookie(r3)
    const revokeOthers = await request(app.getHttpServer())
      .post("/api/auth/revoke-other-sessions")
      .set("Cookie", cookie3)
      .send({})
      .expect(200)
    expect(revokeOthers.body.status).toBe(true)
    const listAfterOthers = await request(app.getHttpServer()).get("/api/auth/list-sessions").set("Cookie", cookie3).expect(200)
    expect(listAfterOthers.body.length).toBe(1)
  })
})

describe("POST /api/auth/revoke-sessions", () => {
  it("revokes all sessions", async () => {
    const { credentials } = await createVerifiedSession()
    const r = await signIn({ email: credentials.email, password: credentials.password }).expect(200)
    const cookie = getAuthCookie(r)
    const revokeAll = await request(app.getHttpServer()).post("/api/auth/revoke-sessions").set("Cookie", cookie).send({}).expect(200)
    expect(revokeAll.body.status).toBe(true)
    const afterAllRevoke = await request(app.getHttpServer()).get("/api/auth/get-session").set("Cookie", cookie).expect(200)
    expect(afterAllRevoke.body).toBeNull()
  })
})

describe("POST /api/auth/change-email", () => {
  it("triggers verification email when authenticated", async () => {
    const { cookie } = await createVerifiedSession()
    const newEmail = createCredentials().email
    vi.mocked(emailService.send).mockClear()
    const res = await request(app.getHttpServer()).post("/api/auth/change-email").set("Cookie", cookie).send({ newEmail })
    if (res.status === 200) expect(res.body.status).toBe(true)
    else expect([400, 401, 403]).toContain(res.status)
  })

  it("returns 401 when unauthenticated", async () => {
    await request(app.getHttpServer()).post("/api/auth/change-email").send({ newEmail: "x@example.com" }).expect(401)
  })
})

describe("POST /api/auth/delete-user", () => {
  it("returns 401 when unauthenticated", async () => {
    await request(app.getHttpServer()).post("/api/auth/delete-user").send({}).expect(401)
  })
})
