import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import request from "supertest"
import { DataSource } from "typeorm"
import { app } from "../../src/main.js"
import { User } from "../../src/modules/auth/entities/user.entity.js"
import { EmailService } from "../../src/email/email.service.js"
import { createCredentials, signUp, signIn, getAuthCookie, extractVerificationToken } from "./helpers.js"

describe("POST /api/auth/sign-in/email", () => {
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
    if (createdUserIds.length > 0) {
      await dataSource.getRepository(User).delete(createdUserIds)
    }
    await app.close()
  })

  it("signs in a verified user and returns token, user and set-cookie", async () => {
    const credentials = createCredentials()
    const signUpRes = await signUp(credentials).expect(200)
    createdUserIds.push(signUpRes.body.user.id)
    const token = extractVerificationToken()
    expect(token).toBeTruthy()
    await request(app.getHttpServer()).get("/api/auth/verify-email").query({ token }).expect(200)

    const res = await signIn({ email: credentials.email, password: credentials.password }).expect(200)

    expect(res.body.redirect).toBe(false)
    expect(res.body.token).toBeDefined()
    expect(typeof res.body.token).toBe("string")
    expect(res.body.user).toMatchObject({
      email: credentials.email.toLowerCase(),
      name: credentials.name
    })
    const cookie = getAuthCookie(res)
    expect(cookie).toContain("better-auth.session_token")

    const sessionRes = await request(app.getHttpServer()).get("/api/auth/get-session").set("Cookie", cookie).expect(200)
    expect(sessionRes.body.user.email).toBe(credentials.email.toLowerCase())
  })

  it("returns 401 for wrong password", async () => {
    const credentials = createCredentials()
    const signUpRes = await signUp(credentials).expect(200)
    createdUserIds.push(signUpRes.body.user.id)
    const token = extractVerificationToken()
    await request(app.getHttpServer()).get("/api/auth/verify-email").query({ token }).expect(200)

    await signIn({ email: credentials.email, password: "wrong-password-123" }).expect(401)
  })

  it("rejects sign-in for unverified email when requireEmailVerification is true", async () => {
    const credentials = createCredentials()
    const signUpRes = await signUp(credentials).expect(200)
    createdUserIds.push(signUpRes.body.user.id)

    const res = await signIn({ email: credentials.email, password: credentials.password })
    expect([401, 403]).toContain(res.status)
  })

  it("normalizes email on sign-in (uppercase still works)", async () => {
    const credentials = createCredentials()
    const signUpRes = await signUp(credentials).expect(200)
    createdUserIds.push(signUpRes.body.user.id)
    const token = extractVerificationToken()
    await request(app.getHttpServer()).get("/api/auth/verify-email").query({ token }).expect(200)

    const res = await signIn({
      email: credentials.email.toUpperCase(),
      password: credentials.password
    }).expect(200)
    expect(res.body.user.email).toBe(credentials.email.toLowerCase())
  })

  it("returns 400 for missing fields", async () => {
    await signIn({}).expect(400)
    await signIn({ email: "a@a.com" }).expect(400)
  })

  it("returns 401 for non-existent email", async () => {
    const credentials = createCredentials()
    await signIn({ email: credentials.email, password: credentials.password }).expect(401)
  })
})
