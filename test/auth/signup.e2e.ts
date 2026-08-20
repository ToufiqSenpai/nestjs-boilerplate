import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { faker } from "@faker-js/faker"
import request from "supertest"
import { DataSource } from "typeorm"
import { app } from "../../src/main.js"
import { User } from "../../src/modules/auth/entities/user.entity.js"
import { Account } from "../../src/modules/auth/entities/account.entity.js"
import { EmailService } from "../../src/email/email.service.js"

describe("POST /api/auth/sign-up/email", () => {
  let dataSource: DataSource
  let emailService: EmailService
  const createdUserIds: string[] = []

  beforeAll(async () => {
    dataSource = app.get(DataSource)
    emailService = app.get(EmailService)
    // Capture verification URLs instead of sending real emails (no Resend key in tests)
    vi.spyOn(emailService, "send").mockResolvedValue(undefined)
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    if (createdUserIds.length > 0) {
      await dataSource.getRepository(User).delete(createdUserIds)
    }
    await app.close()
  })

  const signUp = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post("/api/auth/sign-up/email").send(body)

  const createCredentials = () => ({
    name: faker.person.fullName(),
    email: faker.internet.email(),
    password: faker.internet.password({ length: 12 })
  })

  it("creates a new user and returns a user with emailVerified false (token null because requireEmailVerification)", async () => {
    const credentials = createCredentials()

    const res = await signUp(credentials).expect(200)

    expect(res.body.token).toBeNull()
    expect(res.body.user).toMatchObject({
      email: credentials.email.toLowerCase(),
      emailVerified: false,
      name: credentials.name
    })
    expect(res.body.user.id).toBeDefined()
    expect(res.body.user.createdAt).toBeDefined()
    expect(res.body.user.updatedAt).toBeDefined()
    createdUserIds.push(res.body.user.id)

    // The user is actually persisted in the DB with a lowercase email
    const dbUser = await dataSource.getRepository(User).findOneBy({ id: res.body.user.id })
    expect(dbUser).not.toBeNull()
    expect(dbUser!.email).toBe(credentials.email.toLowerCase())
    expect(dbUser!.emailVerified).toBe(false)

    // Credential account is linked (password hashed with argon2)
    const account = await dataSource
      .getRepository(Account)
      .createQueryBuilder("account")
      .where("account.userId = :userId", { userId: res.body.user.id })
      .getOne()
    expect(account).not.toBeNull()
    expect(account!.providerId).toBe("credential")
    expect(account!.password).toMatch(/^\$argon2/) // hashed, not plaintext
  })

  it("normalizes the email to lowercase", async () => {
    const credentials = createCredentials()
    const uppercaseEmail = credentials.email.toUpperCase()

    const res = await signUp({ ...credentials, email: uppercaseEmail }).expect(200)

    expect(res.body.user.email).toBe(credentials.email.toLowerCase())
    createdUserIds.push(res.body.user.id)
  })

  it("returns a generic response (200, token null, synthetic user) for an already registered email", async () => {
    const credentials = createCredentials()

    const first = await signUp(credentials).expect(200)
    createdUserIds.push(first.body.user.id)

    const dup = await signUp({ ...createCredentials(), email: credentials.email }).expect(200)
    expect(dup.body.token).toBeNull()
    expect(dup.body.user.email).toBe(credentials.email.toLowerCase())
    // Synthetic user — id differs from the real user, but no new DB row is created
    expect(dup.body.user.id).not.toBe(first.body.user.id)
    const count = await dataSource.getRepository(User).countBy({ email: credentials.email.toLowerCase() })
    expect(count).toBe(1)
  })

  it("returns 400 for an invalid payload (invalid email)", async () => {
    const credentials = createCredentials()
    await signUp({ ...credentials, email: "not-an-email" }).expect(400)
  })

  it("returns 400 for a password that is too short", async () => {
    const credentials = createCredentials()
    await signUp({ ...credentials, password: "short" }).expect(400)
  })

  it("returns 400 for a missing body", async () => {
    await signUp({}).expect(400)
  })

  it("verifies the email with the token from the sent verification email", async () => {
    const credentials = createCredentials()
    await signUp(credentials).expect(200)

    // The verification email was "sent" through the mocked EmailService
    const sendCall = vi.mocked(emailService.send).mock.calls.at(-1)
    expect(sendCall).toBeDefined()
    expect(sendCall![0].template).toBe("verification")

    const verificationUrl = sendCall![0].props.verificationUrl as string
    expect(verificationUrl).toContain("/verify-email?token=")
    const token = new URL(verificationUrl).searchParams.get("token")
    expect(token).toBeTruthy()

    const res = await request(app.getHttpServer()).get("/api/auth/verify-email").query({ token }).expect(200)

    // better-auth returns { status: true, user: null } after a successful
    // verification (the updated user is not echoed back)
    expect(res.body.status).toBe(true)
    expect(res.body.user).toBeNull()

    // Persisted state reflects the verification
    const dbUser = await dataSource.getRepository(User).findOneBy({ email: credentials.email.toLowerCase() })
    expect(dbUser).not.toBeNull()
    expect(dbUser!.emailVerified).toBe(true)
    expect(dbUser!.email).toBe(credentials.email.toLowerCase())
    createdUserIds.push(dbUser!.id)
  })
})
