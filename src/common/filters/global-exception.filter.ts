import { Catch, HttpException, HttpStatus } from "@nestjs/common"
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common"
import { Request, Response } from "express"
import { SentryExceptionCaptured } from "@sentry/nestjs"
import { config } from "../../config/index.js"

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  @SentryExceptionCaptured()
  public catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let body: Record<string, unknown> = { message: "Internal server error" }

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const res = exception.getResponse()
      if (typeof res === "string") {
        body = { message: res }
      } else if (res !== null && typeof res === "object") {
        body = { ...res, message: exception.message }
      } else {
        body = { message: exception.message }
      }
    } else if (exception instanceof Error) {
      if (config.app.environment !== "production") {
        body = {
          timestamp: new Date().toISOString(),
          error: exception.constructor.name,
          message: exception.message,
          path: request.path,
          trace: exception.stack
        }
      } else {
        body = { message: exception.message }
      }
    }

    response.status(status).json(body)
  }
}
