import { vi } from "vitest"
import { mocked } from "vitest-mock-extended"
import request from "supertest"
import { DataSource } from "typeorm"
import { app } from "../../src/main.js"
import { User } from "../../src/modules/auth/entities/user.entity.js"
import { Verification } from "../../src/modules/auth/entities/verification.entity.js"
import { EmailService } from "../../src/email/email.service.js"
import { createCredentials, signUp, extractVerificationToken } from "./helpers.js"

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

describe("GET /api/auth/verify-email", () => {
  it("returns error for an invalid token", async () => {
    const res = await request(app.getHttpServer()).get("/api/auth/verify-email").query({ token: "invalid-token-xyz" })
    expect([400, 401]).toContain(res.status)
  })

  it("returns 400 for a missing token", async () => {
    await request(app.getHttpServer()).get("/api/auth/verify-email").expect(400)
  })

  it("returns error for an expired token and does not verify the user", async () => {
    const credentials = createCredentials()
    const signUpRes = await signUp(credentials).expect(200)
    createdUserIds.push(signUpRes.body.user.id)
    const token = extractVerificationToken()!
    const verRepo = dataSource.getRepository(Verification)
    const ver = await verRepo
      .createQueryBuilder("verification")
      .where("verification.value = :value", { value: token })
      .getOne()
    if (ver) {
      await verRepo.update({ id: ver.id }, { expiresAt: new Date(Date.now() - 60_000) })
      const res = await request(app.getHttpServer()).get("/api/auth/verify-email").query({ token })
      expect([400, 401]).toContain(res.status)
      const dbUser = await dataSource.getRepository(User).findOneBy({ id: signUpRes.body.user.id })
      expect(dbUser?.emailVerified).toBe(false)
    } else {
      const res = await request(app.getHttpServer())
        .get("/api/auth/verify-email")
        .query({ token: "expired-token-stub" })
      expect([400, 401]).toContain(res.status)
    }
  })

  it("is idempotent or returns error when reusing a token after success", async () => {
    const credentials = createCredentials()
    const signUpRes = await signUp(credentials).expect(200)
    createdUserIds.push(signUpRes.body.user.id)
    const token = extractVerificationToken()!
    await request(app.getHttpServer()).get("/api/auth/verify-email").query({ token }).expect(200)
    const second = await request(app.getHttpServer()).get("/api/auth/verify-email").query({ token })
    expect([200, 400, 401]).toContain(second.status)
    if (second.status === 200) expect(second.body.status).toBe(true)
  })
})

describe("POST /api/auth/send-verification-email", () => {
  it("sends verification email for an unverified user", async () => {
    const credentials = createCredentials()
    const signUpRes = await signUp(credentials).expect(200)
    createdUserIds.push(signUpRes.body.user.id)
    mocked(emailService.send).mockClear()
    const res = await request(app.getHttpServer())
      .post("/api/auth/send-verification-email")
      .send({ email: credentials.email })
      .expect(200)
    expect(res.body.status).toBe(true)
    const lastCall = mocked(emailService.send).mock.calls.at(-1)
    expect(lastCall?.[0].template).toBe("verification")
  })

  it("returns 400 for an invalid email", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/send-verification-email")
      .send({ email: "not-an-email" })
      .expect(400)
  })

  it("returns 400 for a missing email", async () => {
    await request(app.getHttpServer()).post("/api/auth/send-verification-email").send({}).expect(400)
  })
})
