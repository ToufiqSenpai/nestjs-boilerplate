import { vi } from "vitest"
import { mock } from "vitest-mock-extended"
import { BadRequestException, HttpException, HttpStatus } from "@nestjs/common"
import type { ArgumentsHost } from "@nestjs/common"
import { Request, Response } from "express"
import { GlobalExceptionFilter } from "./global-exception.filter.js"

vi.mock("@sentry/nestjs", () => ({
  SentryExceptionCaptured: () => () => () => {}
}))

vi.mock("../../config/index.js", () => ({
  config: {
    app: { environment: "production" }
  }
}))

function createHost() {
  const json = vi.fn()
  const status = vi.fn().mockReturnValue({ json })
  const response = { status } as unknown as Response
  const request = { url: "/test", path: "/test" } as unknown as Request
  const host = mock<ArgumentsHost>()
  host.switchToHttp.mockReturnValue({
    getResponse: () => response,
    getRequest: () => request
  } as unknown as ReturnType<ArgumentsHost["switchToHttp"]>)
  return { host, json, status, response, request }
}

describe("GlobalExceptionFilter", () => {
  let filter: GlobalExceptionFilter

  beforeEach(() => {
    filter = new GlobalExceptionFilter()
  })

  it("should handle HttpException with string response", () => {
    const { host, json, status } = createHost()
    const exception = new HttpException("Forbidden", HttpStatus.FORBIDDEN)

    filter.catch(exception, host)

    expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN)
    expect(json).toHaveBeenCalledWith({ message: "Forbidden" })
  })

  it("should handle HttpException with object message", () => {
    const { host, json, status } = createHost()
    const exception = new HttpException({ message: "foo" } as never, HttpStatus.BAD_REQUEST)

    filter.catch(exception, host)

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
    expect(json).toHaveBeenCalledWith({ message: "foo" })
  })

  it("should expose HttpException message when response contains array (no join in current filter)", () => {
    const { host, json, status } = createHost()
    const exception = new HttpException({ message: ["a", "b"] } as never, HttpStatus.BAD_REQUEST)

    filter.catch(exception, host)

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
    // Current filter: body = { ...res, message: exception.message } -> exception.message is "Http Exception"
    expect(json).toHaveBeenCalledWith({ message: "Http Exception" })
  })

  it("should preserve extra fields and fallback message when response has no message", () => {
    const { host, json, status } = createHost()
    const exception = new HttpException({ error: "oops" } as never, HttpStatus.BAD_REQUEST)

    filter.catch(exception, host)

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
    expect(json).toHaveBeenCalledWith({ error: "oops", message: exception.message })
  })

  it("should forward all response fields including errors array and guarantee message", () => {
    const { host, json, status } = createHost()
    const exception = new BadRequestException({
      message: "Validation failed",
      errors: [{ path: "email", message: "invalid" }]
    })

    filter.catch(exception, host)

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
    expect(json).toHaveBeenCalledWith({
      message: "Validation failed",
      errors: [{ path: "email", message: "invalid" }]
    })
  })

  it("should forward custom fields with HttpException message (no array normalization)", () => {
    const { host, json, status } = createHost()
    const exception = new HttpException(
      { message: ["a", "b"], code: "ERR_VALIDATION" } as never,
      HttpStatus.BAD_REQUEST
    )

    filter.catch(exception, host)

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
    // Current filter does not join arrays, it forwards exception.message
    expect(json).toHaveBeenCalledWith({ message: "Http Exception", code: "ERR_VALIDATION" })
  })

  it("should handle generic Error", () => {
    const { host, json, status } = createHost()

    filter.catch(new Error("boom"), host)

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
    expect(json).toHaveBeenCalledWith({ message: "boom" })
  })

  it("should return empty message when Error message is empty (no fallback in current filter)", () => {
    const { host, json, status } = createHost()

    filter.catch(new Error(""), host)

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
    // Current filter in production: body = { message: exception.message } -> "" (no fallback)
    expect(json).toHaveBeenCalledWith({ message: "" })
  })

  it("should handle non-Error throw", () => {
    const { host, json, status } = createHost()

    filter.catch("string", host)

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
    expect(json).toHaveBeenCalledWith({ message: "Internal server error" })
  })

  it("should handle null throw", () => {
    const { host, json, status } = createHost()

    filter.catch(null, host)

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
    expect(json).toHaveBeenCalledWith({ message: "Internal server error" })
  })
})
