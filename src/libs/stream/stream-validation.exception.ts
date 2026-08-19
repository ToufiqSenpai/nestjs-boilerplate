import type { StreamValidator } from "./stream-validator.js"

export class StreamValidationException extends Error {
  public constructor(
    message: string,
    public readonly validator: StreamValidator
  ) {
    super(message)
    this.name = "StreamValidationException"
    Error.captureStackTrace(this, this.constructor)
  }
}
