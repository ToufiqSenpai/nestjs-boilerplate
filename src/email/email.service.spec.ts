import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { Resend, type CreateEmailResponse } from "resend"
import { EmailService } from "./email.service.js"
import VerificationEmail from "./templates/verification.js"

vi.mock("@sentry/nestjs", () => ({
  captureException: vi.fn()
}))

function createMocks() {
  const send = vi.fn()
  const resend = { emails: { send } } as unknown as Resend

  return { resend, send }
}

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
  let mocks: ReturnType<typeof createMocks>
  let service: EmailService
  let defaultParams: Parameters<EmailService["send"]>[0]

  beforeEach(() => {
    mocks = createMocks()
    service = new EmailService(mocks.resend)
    defaultParams = {
      to: "user@example.com",
      template: "verification",
      props: { name: "John", verificationUrl: "https://example.com/verify/1" },
      userId: "user-42"
    }
  })

  describe("send", () => {
    it("should send with the correct payload", async () => {
      mocks.send.mockResolvedValue(success("msg_123"))

      await service.send({ ...defaultParams, locale: "en" })

      expect(mocks.send).toHaveBeenCalledTimes(1)

      const [payload, options] = mocks.send.mock.calls[0] as [Record<string, unknown>, { idempotencyKey: string }]
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
      mocks.send.mockResolvedValue(success())

      await service.send({ ...defaultParams, idempotencyKey: "my-key" })

      const [, options] = mocks.send.mock.calls[0] as [Record<string, unknown>, { idempotencyKey: string }]
      expect(options.idempotencyKey).toBe("my-key")
    })

    it("should generate a UUID idempotencyKey when not provided", async () => {
      mocks.send.mockResolvedValue(success())

      await service.send(defaultParams)

      const [, options] = mocks.send.mock.calls[0] as [Record<string, unknown>, { idempotencyKey: string }]
      expect(options.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
    })

    it("should override the email_type tag with a custom emailType", async () => {
      mocks.send.mockResolvedValue(success())

      await service.send({ ...defaultParams, emailType: "auth" })

      const [payload] = mocks.send.mock.calls[0] as [Record<string, unknown>]
      expect(payload.tags).toEqual([
        { name: "email_type", value: "auth" },
        { name: "user_id", value: "user-42" }
      ])
    })

    it("should use a valid locale passed in the params", async () => {
      mocks.send.mockResolvedValue(success())

      await service.send({ ...defaultParams, locale: "en" })

      const [payload] = mocks.send.mock.calls[0] as [Record<string, unknown>]
      expect((payload.react as { props: Record<string, unknown> }).props.locale).toBe("en")
    })

    it("should pass through a non-standard locale", async () => {
      mocks.send.mockResolvedValue(success())

      await service.send({ ...defaultParams, locale: "xx" })

      const [payload] = mocks.send.mock.calls[0] as [Record<string, unknown>]
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
      mocks.send.mockResolvedValueOnce(errorResult(429)).mockResolvedValueOnce(success("msg_retry"))

      const promise = service.send(defaultParams)
      await vi.advanceTimersByTimeAsync(10_000)
      await promise

      expect(mocks.send).toHaveBeenCalledTimes(2)
      const firstKey = mocks.send.mock.calls[0][1].idempotencyKey
      const secondKey = mocks.send.mock.calls[1][1].idempotencyKey
      expect(firstKey).toBe(secondKey)
    })

    it("should give up after three attempts on a retryable error", async () => {
      mocks.send.mockResolvedValue(errorResult(500, "server error"))

      const promise = service.send(defaultParams)
      await vi.advanceTimersByTimeAsync(30_000)
      await promise

      expect(mocks.send).toHaveBeenCalledTimes(3)
    })

    it("should not retry on a non-retryable error", async () => {
      mocks.send.mockResolvedValue(errorResult(400, "bad request"))

      await service.send(defaultParams)

      expect(mocks.send).toHaveBeenCalledTimes(1)
    })
  })
})
