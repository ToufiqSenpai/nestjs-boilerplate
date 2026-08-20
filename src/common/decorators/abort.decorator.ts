import { createParamDecorator, ExecutionContext } from "@nestjs/common"
import type { Request } from "express"

export const ABORT_TOKEN: unique symbol = Symbol("requestAbortController")

declare global {
  namespace Express {
    interface Request {
      [ABORT_TOKEN]?: AbortController
    }
  }
}

export const Abort = createParamDecorator((_data: unknown, ctx: ExecutionContext): AbortController => {
  const req = ctx.switchToHttp().getRequest<Request>()
  const existing = req[ABORT_TOKEN]

  if (existing) return existing

  const controller = new AbortController()
  req[ABORT_TOKEN] = controller

  req.once("error", (err: Error) => {
    if (!controller.signal.aborted) controller.abort(err)
  })
  req.once("close", () => {
    if (controller.signal.aborted) return
    const premature = req.complete === false || !!req.destroyed || req.readableEnded === false
    if (premature) controller.abort(new DOMException("Request aborted by client", "AbortError"))
  })

  return controller
})
