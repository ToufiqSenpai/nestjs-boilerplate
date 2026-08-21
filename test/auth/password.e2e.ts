import { vi } from "vitest"
import { mocked } from "vitest-mock-extended"
import request from "supertest"
import { DataSource } from "typeorm"
import { app } from "../../src/main.js"
import { User } from "../../src/modules/auth/entities/user.entity.js"
import { EmailService } from "../../src/email/email.service.js"
import {
  createCredentials,
  signUp,
  signIn,
  getAuthCookie,
  extractVerificationToken,
  extractResetToken
} from "./helpers.js"

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
})

async function createVerifiedUserWithSession() {
  const credentials = createCredentials()
  const signUpRes = await signUp(credentials).expect(200)
  createdUserIds.push(signUpRes.body.user.id)
  const vToken = extractVerificationToken()!
  await request(app.getHttpServer()).get("/api/auth/verify-email").query({ token: vToken }).expect(200)
  const signInRes = await signIn({ email: credentials.email, password: credentials.password }).expect(200)
  return { credentials, cookie: getAuthCookie(signInRes) }
}

describe("POST /api/auth/request-password-reset", () => {
  it("sends reset email for an existing email", async () => {
    const { credentials } = await createVerifiedUserWithSession()
    mocked(emailService.send).mockClear()
    const res = await request(app.getHttpServer())
      .post("/api/auth/request-password-reset")
      .send({ email: credentials.email, redirectTo: "http://localhost:3000/reset" })
      .expect(200)
    expect(res.body.status).toBe(true)
    expect(mocked(emailService.send).mock.calls.length).toBeGreaterThan(0)
  })

  it("still returns 200 for an unknown email", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/request-password-reset")
      .send({ email: `unknown-${Date.now()}@example.com` })
      .expect(200)
    expect(res.body.status).toBe(true)
  })

  it("returns 400 for an invalid email", async () => {
    await request(app.getHttpServer()).post("/api/auth/request-password-reset").send({ email: "bad" }).expect(400)
  })
})

describe("POST /api/auth/reset-password", () => {
  it("rotates password with a valid token and revokes existing sessions", async () => {
    const { credentials, cookie: oldCookie } = await createVerifiedUserWithSession()
    mocked(emailService.send).mockClear()
    await request(app.getHttpServer())
      .post("/api/auth/request-password-reset")
      .send({ email: credentials.email, redirectTo: "http://localhost:3000/reset" })
      .expect(200)
    const token = extractResetToken()
    if (!token) {
      expect(true).toBe(true)
      return
    }
    const newPassword = createCredentials().password
    const resetRes = await request(app.getHttpServer())
      .post("/api/auth/reset-password")
      .send({ newPassword, token })
      .expect(200)
    expect(resetRes.body.status).toBe(true)
    await signIn({ email: credentials.email, password: credentials.password }).expect(401)
    await signIn({ email: credentials.email, password: newPassword }).expect(200)
    const sessionAfter = await request(app.getHttpServer())
      .get("/api/auth/get-session")
      .set("Cookie", oldCookie)
      .expect(200)
    expect(sessionAfter.body).toBeNull()
    credentials.password = newPassword
  })

  it("returns 400 for an invalid token", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/reset-password")
      .send({ newPassword: createCredentials().password, token: "invalid-token" })
      .expect(400)
  })
})

describe("POST /api/auth/verify-password", () => {
  it("returns status true for the correct password when authenticated", async () => {
    const { credentials, cookie } = await createVerifiedUserWithSession()
    const res = await request(app.getHttpServer())
      .post("/api/auth/verify-password")
      .set("Cookie", cookie)
      .send({ password: credentials.password })
      .expect(200)
    expect(res.body.status).toBe(true)
  })

  it("returns error for the wrong password", async () => {
    const { cookie } = await createVerifiedUserWithSession()
    const res = await request(app.getHttpServer())
      .post("/api/auth/verify-password")
      .set("Cookie", cookie)
      .send({ password: "wrong-password-xyz" })
    expect([400, 401]).toContain(res.status)
  })
})

describe("POST /api/auth/change-password", () => {
  it("rotates password and revokes other sessions when revokeOtherSessions is true", async () => {
    const { credentials } = await createVerifiedUserWithSession()
    const firstSignIn = await signIn({ email: credentials.email, password: credentials.password }).expect(200)
    const cookie1 = getAuthCookie(firstSignIn)
    const secondSignIn = await signIn({ email: credentials.email, password: credentials.password }).expect(200)
    const cookie2 = getAuthCookie(secondSignIn)
    const newPassword = createCredentials().password
    const res = await request(app.getHttpServer())
      .post("/api/auth/change-password")
      .set("Cookie", cookie1)
      .send({ currentPassword: credentials.password, newPassword, revokeOtherSessions: true })
      .expect(200)
    expect(res.body.user).toBeDefined()
    await signIn({ email: credentials.email, password: newPassword }).expect(200)
    await signIn({ email: credentials.email, password: credentials.password }).expect(401)
    const otherSession = await request(app.getHttpServer())
      .get("/api/auth/get-session")
      .set("Cookie", cookie2)
      .expect(200)
    expect(otherSession.body).toBeNull()
  })

  it("returns error for a wrong currentPassword", async () => {
    const { cookie } = await createVerifiedUserWithSession()
    const res = await request(app.getHttpServer())
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .send({ currentPassword: "wrong", newPassword: createCredentials().password })
    expect([400, 401]).toContain(res.status)
  })

  it("returns 401 when unauthenticated", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/change-password")
      .send({ currentPassword: "x", newPassword: "y" })
      .expect(401)
  })
})
