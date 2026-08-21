import { vi } from "vitest"
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended"
import { Test } from "@nestjs/testing"
import { Resend, type CreateEmailResponse } from "resend"
import { EmailService } from "./email.service.js"
import VerificationEmail from "./templates/verification.js"

vi.mock("@sentry/nestjs", () => ({
  captureException: vi.fn()
}))

function success(id = "msg_123"): CreateEmailResponse {
  return {
    data: { id },
    error: null,
    headers: {}
  }
}

function errorResult(statusCode: number, message = "boom"): CreateEmailResponse {
  return {
    data: null,
    error: { statusCode, message, name: "application_error" },
    headers: {}
  }
}

const DEFAULT_SUBJECT = "Verify your email for Acme"

describe("EmailService", () => {
  let mockResend: DeepMockProxy<Resend>
  let service: EmailService
  let defaultParams: Parameters<EmailService["send"]>[0]

  beforeEach(async () => {
    mockResend = mockDeep<Resend>()
    const moduleRef = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: Resend, useValue: mockResend }
      ]
    }).compile()
    service = moduleRef.get(EmailService)
    defaultParams = {
      to: "user@example.com",
      template: "verification",
      props: { name: "John", verificationUrl: "https://example.com/verify/1" },
      userId: "user-42"
    }
  })

  describe("send", () => {
    it("should send with the correct payload", async () => {
      mockResend.emails.send.mockResolvedValue(success("msg_123"))

      await service.send({ ...defaultParams, locale: "en" })

      expect(mockResend.emails.send).toHaveBeenCalledTimes(1)

      const [payload, options] = mockResend.emails.send.mock.calls[0] as [Record<string, unknown>, { idempotencyKey: string }]
      expect(payload).toMatchObject({
        from: "Acme <onboarding@resend.dev>",
        replyTo: "support@example.com",
        to: ["user@example.com"],
        subject: DEFAULT_SUBJECT,
        tags: [
          { name: "email_type", value: "verification" },
          { name: "user_id", value: "user-42" }
        ]
      })
      expect(payload.react).toMatchObject({
        type: VerificationEmail,
        props: {
          name: "John",
          verificationUrl: "https://example.com/verify/1",
          locale: "en"
        }
      })
      expect(options.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
    })

    it("should pass through a custom idempotencyKey", async () => {
      mockResend.emails.send.mockResolvedValue(success())

      await service.send({ ...defaultParams, idempotencyKey: "my-key" })

      const [, options] = mockResend.emails.send.mock.calls[0] as [Record<string, unknown>, { idempotencyKey: string }]
      expect(options.idempotencyKey).toBe("my-key")
    })

    it("should generate a UUID idempotencyKey when not provided", async () => {
      mockResend.emails.send.mockResolvedValue(success())

      await service.send(defaultParams)

      const [, options] = mockResend.emails.send.mock.calls[0] as [Record<string, unknown>, { idempotencyKey: string }]
      expect(options.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
    })

    it("should override the email_type tag with a custom emailType", async () => {
      mockResend.emails.send.mockResolvedValue(success())

      await service.send({ ...defaultParams, emailType: "auth" })

      const [payload] = mockResend.emails.send.mock.calls[0] as [Record<string, unknown>]
      expect(payload.tags).toEqual([
        { name: "email_type", value: "auth" },
        { name: "user_id", value: "user-42" }
      ])
    })

    it("should use a valid locale passed in the params", async () => {
      mockResend.emails.send.mockResolvedValue(success())

      await service.send({ ...defaultParams, locale: "en" })

      const [payload] = mockResend.emails.send.mock.calls[0] as [Record<string, unknown>]
      expect((payload.react as { props: Record<string, unknown> }).props.locale).toBe("en")
    })

    it("should pass through a non-standard locale", async () => {
      mockResend.emails.send.mockResolvedValue(success())

      await service.send({ ...defaultParams, locale: "xx" })

      const [payload] = mockResend.emails.send.mock.calls[0] as [Record<string, unknown>]
      expect((payload.react as { props: Record<string, unknown> }).props.locale).toBe("xx")
    })
  })

  describe("retry", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("should retry with the same idempotency key", async () => {
      mockResend.emails.send.mockResolvedValueOnce(errorResult(429)).mockResolvedValueOnce(success("msg_retry"))

      const promise = service.send(defaultParams)
      await vi.advanceTimersByTimeAsync(10_000)
      await promise

      expect(mockResend.emails.send).toHaveBeenCalledTimes(2)
      const firstKey = mockResend.emails.send.mock.calls[0][1].idempotencyKey
      const secondKey = mockResend.emails.send.mock.calls[1][1].idempotencyKey
      expect(firstKey).toBe(secondKey)
    })

    it("should give up after three attempts on a retryable error", async () => {
      mockResend.emails.send.mockResolvedValue(errorResult(500, "server error"))

      const promise = service.send(defaultParams)
      await vi.advanceTimersByTimeAsync(30_000)
      await promise

      expect(mockResend.emails.send).toHaveBeenCalledTimes(3)
    })

    it("should not retry on a non-retryable error", async () => {
      mockResend.emails.send.mockResolvedValue(errorResult(400, "bad request"))

      await service.send(defaultParams)

      expect(mockResend.emails.send).toHaveBeenCalledTimes(1)
    })
  })
})
