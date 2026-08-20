import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common"
import type { Observable } from "rxjs"
import { PassThrough } from "stream"
import type { Request } from "express"
import { StreamValidation } from "./stream-validation.js"
import type { StreamValidator } from "./stream-validator.js"

declare global {
  namespace Express {
    interface Request {
      [Symbol.asyncIterator]?: () => AsyncIterableIterator<Buffer>
    }
  }
}

@Injectable()
export class RequestStreamInterceptor implements NestInterceptor {
  public constructor(private readonly validators: StreamValidator[]) {}

  public async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<Request>()

    const validated = new StreamValidation<Buffer>(...this.validators).stream
    const output = new PassThrough()

    validated.on("error", (err: Error) => {
      if (!output.destroyed) output.destroy(err)
      if (req.listenerCount("error") > 0) req.emit("error", err)
    })
    output.on("error", () => {})

    req.pipe(validated)
    validated.pipe(output)

    req[Symbol.asyncIterator] = () => output[Symbol.asyncIterator]()

    return next.handle()
  }
}
