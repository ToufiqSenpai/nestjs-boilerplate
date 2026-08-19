import { Injectable, NestMiddleware } from "@nestjs/common"
import { Request, Response, NextFunction } from "express"
import * as Sentry from "@sentry/nestjs"

@Injectable()
export class SentryContextMiddleware implements NestMiddleware {
  public use(
    req: Request & { user?: { id: string; email?: string; role?: string } },
    _res: Response,
    next: NextFunction
  ): void {
    if (req.user) {
      Sentry.setUser({ id: req.user.id, email: req.user.email })
      if (req.user.role) {
        Sentry.setTag("user.role", req.user.role)
      }
    }
    next()
  }
}
