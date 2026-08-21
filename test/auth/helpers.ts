import { faker } from "@faker-js/faker"
import request from "supertest"
import { vi } from "vitest"
import { mocked } from "vitest-mock-extended"
import type { DataSource } from "typeorm"
import { app } from "../../src/main.js"
import { User } from "../../src/modules/auth/entities/user.entity.js"
import { EmailService } from "../../src/email/email.service.js"

export function createCredentials() {
  return {
    name: faker.person.fullName(),
    email: faker.internet.email(),
    password: faker.internet.password({ length: 12 })
  }
}

export const signUp = (body: Record<string, unknown>) =>
  request(app.getHttpServer()).post("/api/auth/sign-up/email").send(body)

export const signIn = (body: Record<string, unknown>) =>
  request(app.getHttpServer()).post("/api/auth/sign-in/email").send(body)

export function getAuthCookie(res: request.Response): string {
  const raw = res.headers["set-cookie"] as unknown
  if (!raw) return ""
  const parts = Array.isArray(raw) ? raw : [raw as string]
  return parts.map(c => c.split(";")[0]).join("; ")
}

export function withCookie(req: request.Test, cookie: string): request.Test {
  if (!cookie) return req
  return req.set("Cookie", cookie)
}

export function extractVerificationUrl(): string | null {
  const calls = mocked(app.get(EmailService).send).mock.calls
  const match = [...calls].reverse().find(c => (c[0] as { template: string }).template === "verification")
  if (!match) return null
  return (match[0] as { props: { verificationUrl: string } }).props.verificationUrl
}

export function extractVerificationToken(): string | null {
  const url = extractVerificationUrl()
  if (!url) return null
  try {
    return new URL(url).searchParams.get("token")
  } catch {
    return null
  }
}

export function extractResetUrl(): string | null {
  const calls = mocked(app.get(EmailService).send).mock.calls
  const match = [...calls].reverse().find(c => (c[0] as { template: string }).template === "reset-password")
  if (!match) return null
  return (match[0] as { props: { resetUrl: string } }).props.resetUrl
}

export function extractResetToken(): string | null {
  const url = extractResetUrl()
  if (!url) return null
  try {
    return new URL(url).searchParams.get("token")
  } catch {
    return null
  }
}

export async function createVerifiedUser(
  overrides: Partial<ReturnType<typeof createCredentials>> = {}
): Promise<{ user: { id: string; email: string }; cookie: string; credentials: ReturnType<typeof createCredentials> }> {
  const credentials = { ...createCredentials(), ...overrides }
  const signUpRes = await signUp(credentials).expect(200)
  const token = extractVerificationToken()
  if (!token) throw new Error("verification token not captured from EmailService.send")
  await request(app.getHttpServer()).get("/api/auth/verify-email").query({ token }).expect(200)
  const signInRes = await signIn({ email: credentials.email, password: credentials.password }).expect(200)
  const cookie = getAuthCookie(signInRes)
  const dbUser = await app.get(DataSource).getRepository(User).findOneBy({ email: credentials.email.toLowerCase() })
  if (!dbUser) throw new Error("verified user not found in DB")
  void signUpRes
  return { user: { id: dbUser.id, email: dbUser.email }, cookie, credentials }
}

export function mockEmailSend(emailService: EmailService) {
  return vi.spyOn(emailService, "send").mockResolvedValue(undefined)
}
