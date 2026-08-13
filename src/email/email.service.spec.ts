import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { ConfigService } from "@nestjs/config"
import { Logger } from "nestjs-pino"
import { Resend, type CreateEmailResponse } from "resend"
import { EmailService, type SendEmailParams } from "./email.service.js"
import VerificationEmail from "./templates/verification.js"

vi.mock("@sentry/nestjs", () => ({
  captureException: vi.fn(),
}))

function createMocks() {
  const config = {
    getOrThrow: vi.fn().mockImplementation((key: string) => {
      if (key === "email.from") return "Acme <no-reply@acme.com>"
      throw new Error(`Missing config key: ${key}`)
    }),
    get: vi.fn().mockReturnValue(undefined)
  } as unknown as ConfigService

  const logger = {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  } as unknown as Logger

  const send = vi.fn()
  const resend = { emails: { send } } as unknown as Resend

  return { config, logger, resend, send }
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
  let defaultParams: SendEmailParams<"verification">

  beforeEach(() => {
    mocks = createMocks()
    service = new EmailService(mocks.resend, mocks.logger, mocks.config)
    defaultParams = {
      to: "user@example.com",
      template: "verification",
      props: { name: "John", verificationUrl: "https://example.com/verify/1" },
      userId: "user-42"
    }
  })

  describe("constructor", () => {
    it("should throw when email.from is missing", () => {
      mocks.config.getOrThrow.mockImplementation((key: string) => {
        throw new Error(`Missing config key: ${key}`)
      })

      expect(() => new EmailService(mocks.resend, mocks.logger, mocks.config)).toThrow()
    })
  })

  describe("send", () => {
    it("should send with the correct payload", async () => {
      mocks.send.mockResolvedValue(success("msg_123"))

      await service.send({ ...defaultParams, locale: "en" })

      expect(mocks.send).toHaveBeenCalledTimes(1)

      const [payload, options] = mocks.send.mock.calls[0] as [Record<string, unknown>, { idempotencyKey: string }]
      expect(payload).toMatchObject({
        from: "Acme <no-reply@acme.com>",
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
      expect(payload).not.toHaveProperty("replyTo")
      expect(options.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
    })

    it("should not include replyTo when not configured", async () => {
      mocks.send.mockResolvedValue(success())

      await service.send(defaultParams)

      const [payload] = mocks.send.mock.calls[0] as [Record<string, unknown>]
      expect(payload).not.toHaveProperty("replyTo")
    })

    it("should include replyTo when configured", async () => {
      mocks.config.get.mockReturnValue("replies@example.com")
      mocks.send.mockResolvedValue(success())

      const svc = new EmailService(mocks.resend, mocks.logger, mocks.config)
      await svc.send(defaultParams)

      const [payload] = mocks.send.mock.calls[0] as [Record<string, unknown>]
      expect(payload.replyTo).toBe("replies@example.com")
    })

    it("should log the email-sent event with the message id", async () => {
      mocks.send.mockResolvedValue(success("msg_789"))

      await service.send(defaultParams)

      expect(mocks.logger.log).toHaveBeenCalledWith(
        {
          event: "email-sent",
          emailType: "verification",
          userId: "user-42",
          messageId: "msg_789"
        },
        "Email sent"
      )
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

    it("should retry with the same idempotency key and log a warning", async () => {
      mocks.send.mockResolvedValueOnce(errorResult(429)).mockResolvedValueOnce(success("msg_retry"))

      const promise = service.send(defaultParams)
      await vi.advanceTimersByTimeAsync(10_000)
      await promise

      expect(mocks.send).toHaveBeenCalledTimes(2)
      const firstKey = mocks.send.mock.calls[0][1].idempotencyKey
      const secondKey = mocks.send.mock.calls[1][1].idempotencyKey
      expect(firstKey).toBe(secondKey)
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "email-send-retry",
          attempt: 1,
          emailType: "verification",
          userId: "user-42"
        }),
        "Retrying email send"
      )
      expect(mocks.logger.log).toHaveBeenCalledWith(expect.objectContaining({ event: "email-sent", messageId: "msg_retry" }), "Email sent")
    })

    it("should give up after three attempts on a retryable error", async () => {
      mocks.send.mockResolvedValue(errorResult(500, "server error"))

      const promise = service.send(defaultParams)
      await vi.advanceTimersByTimeAsync(30_000)
      await promise

      expect(mocks.send).toHaveBeenCalledTimes(3)
      expect(mocks.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "email-send-failed",
          statusCode: 500,
          error: "server error"
        }),
        "Email send failed"
      )
    })

    it("should not retry on a non-retryable error", async () => {
      mocks.send.mockResolvedValue(errorResult(400, "bad request"))

      await service.send(defaultParams)

      expect(mocks.send).toHaveBeenCalledTimes(1)
      expect(mocks.logger.error).toHaveBeenCalledWith(expect.objectContaining({ event: "email-send-failed", statusCode: 400 }), "Email send failed")
    })
  })
})
