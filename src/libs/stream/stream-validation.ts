import { Duplex } from "stream"
import type { StreamValidator } from "./stream-validator.js"
import { StreamValidationException } from "./stream-validation.exception.js"

export class StreamValidation<T = unknown> {
  private readonly validators: StreamValidator<T>[]

  public constructor(...validators: StreamValidator<T>[]) {
    this.validators = validators
  }

  public get stream(): Duplex {
    return Duplex.from(this.run.bind(this))
  }

  private async *run(source: AsyncIterable<T>): AsyncGenerator<T> {
    for await (const chunk of source) {
      for (const validator of this.validators) {
        const isValid = await validator.validate(chunk)
        if (!isValid) {
          throw new StreamValidationException(await validator.message(), validator)
        }
      }
      yield chunk
    }

    for (const validator of this.validators) {
      if (!validator.flush) continue
      const isValid = await validator.flush()
      if (!isValid) {
        throw new StreamValidationException(await validator.message(), validator)
      }
    }
  }
}
