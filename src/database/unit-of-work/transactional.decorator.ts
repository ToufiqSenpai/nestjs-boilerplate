import { SetMetadata } from "@nestjs/common"
import { UnitOfWork } from "./unit-of-work.js"
import type { TransactionOptions } from "./unit-of-work.js"

export const TRANSACTIONAL_METADATA_KEY = "transactional"

/**
 * Decorator that marks a method to be executed within a database transaction.
 *
 * The wrapped method resolves the `UnitOfWork` instance at call time through
 * its static `instance` reference, so services don't need to inject it
 * manually.
 *
 * @example
 * ```ts
 * @Transactional()
 * async createUser() { ... }
 *
 * @Transactional({ isolationLevel: "SERIALIZABLE" })
 * async processPayment() { ... }
 *
 * @Transactional({ propagation: "REQUIRES_NEW" })
 * async logAudit() { ... }
 * ```
 */
export function Transactional(options: TransactionOptions = {}): MethodDecorator {
  return (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value as (...args: any[]) => unknown

    if (typeof originalMethod !== "function") {
      throw new TypeError(
        `@Transactional must be applied to a class method, but "${String(
          propertyKey
        )}" is a class property. Use a regular method instead of an arrow-function field.`
      )
    }

    const wrappedMethod = async function (this: unknown, ...args: any[]): Promise<unknown> {
      const unitOfWork = UnitOfWork.instance
      if (!unitOfWork) {
        throw new Error(
          "@Transactional: UnitOfWork.instance is not set. Make sure UnitOfWork is registered and the application has started."
        )
      }

      return unitOfWork.transaction(() => originalMethod.apply(this, args), {
        propagation: options.propagation,
        isolationLevel: options.isolationLevel,
        onCommit: options.onCommit,
        onRollback: options.onRollback
      })
    }

    descriptor.value = wrappedMethod

    SetMetadata(TRANSACTIONAL_METADATA_KEY, {
      propagation: options.propagation,
      isolationLevel: options.isolationLevel
    })(target, propertyKey, descriptor)

    return descriptor
  }
}
