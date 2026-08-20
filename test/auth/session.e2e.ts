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
  return { credentials, cookie: getAuthCookie(signInRes), userId: signUpRes.body.user.id as string }
}

describe("GET /api/auth/get-session", () => {
  it("returns null when unauthenticated", async () => {
    const res = await request(app.getHttpServer()).get("/api/auth/get-session").expect(200)
    expect(res.body).toBeNull()
  })

  it("returns session and user when authenticated", async () => {
    const { cookie, credentials } = await createVerifiedSession()
    const res = await request(app.getHttpServer()).get("/api/auth/get-session").set("Cookie", cookie).expect(200)
    expect(res.body.session).toBeDefined()
    expect(res.body.user.email).toBe(credentials.email.toLowerCase())
  })

  it("is consistent across repeated calls", async () => {
    const { cookie } = await createVerifiedSession()
    const getRes = await request(app.getHttpServer()).get("/api/auth/get-session").set("Cookie", cookie).expect(200)
    const postRes = await request(app.getHttpServer()).get("/api/auth/get-session").set("Cookie", cookie).expect(200)
    expect(postRes.body.user.id).toBe(getRes.body.user.id)
    expect(postRes.body.session.id).toBe(getRes.body.session.id)
  })
})

describe("POST /api/auth/sign-out", () => {
  it("clears the session and subsequent get-session returns null", async () => {
    const { cookie } = await createVerifiedSession()
    const signOutRes = await request(app.getHttpServer())
      .post("/api/auth/sign-out")
      .set("Cookie", cookie)
      .send({})
      .expect(200)
    expect(signOutRes.body.success).toBe(true)
    const after = await request(app.getHttpServer()).get("/api/auth/get-session").set("Cookie", cookie).expect(200)
    expect(after.body).toBeNull()
  })
})

describe("POST /api/auth/update-user", () => {
  it("updates name when authenticated", async () => {
    const { cookie } = await createVerifiedSession()
    const newName = "Updated Name"
    const res = await request(app.getHttpServer())
      .post("/api/auth/update-user")
      .set("Cookie", cookie)
      .send({ name: newName })
    expect(res.status).toBe(200)
    const bodyUser = (res.body as { user?: { name: string } }).user ?? (res.body as { name: string })
    const updatedName = bodyUser.name
    expect(updatedName).toBe(newName)
    const session = await request(app.getHttpServer()).get("/api/auth/get-session").set("Cookie", cookie).expect(200)
    expect(session.body.user.name).toBe(newName)
  })

  it("returns 401 when unauthenticated", async () => {
    await request(app.getHttpServer()).post("/api/auth/update-user").send({ name: "Nope" }).expect(401)
  })
})
