import { Catch, HttpException, HttpStatus } from "@nestjs/common"
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common"
import { Response } from "express"
import { SentryExceptionCaptured } from "@sentry/nestjs"

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  @SentryExceptionCaptured()
  public catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let message = "Internal server error"

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const res = exception.getResponse()
      message =
        typeof res === "string"
          ? res
          : (((res as { message?: string | string[] }).message as string) ?? exception.message)
      if (Array.isArray(message)) message = message.join(", ")
    } else if (exception instanceof Error) {
      message = exception.message || message
    }

    response.status(status).json({ message })
  }
}
