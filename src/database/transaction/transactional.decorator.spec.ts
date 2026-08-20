import "reflect-metadata"
import { UnitOfWork } from "./unit-of-work.js"
import { Transactional, TRANSACTIONAL_METADATA_KEY } from "./transactional.decorator.js"
import { vi } from "vitest"

class Target {}

describe("Transactional decorator", () => {
  afterEach(() => {
    UnitOfWork.instance = null
  })

  it("should throw when applied to a class property", () => {
    const descriptor = {
      value: undefined
    } as unknown as PropertyDescriptor

    expect(() => Transactional()(Target.prototype, "field", descriptor)).toThrow(/class property/)
  })

  it("should set transaction metadata on the method", () => {
    const descriptor = {
      value: () => "ok"
    } as unknown as PropertyDescriptor

    const returned = Transactional({
      propagation: "REQUIRES_NEW",
      isolationLevel: "SERIALIZABLE"
    })(Target.prototype, "method", descriptor)

    const metadata = Reflect.getMetadata(TRANSACTIONAL_METADATA_KEY, returned.value)

    expect(metadata).toEqual({
      propagation: "REQUIRES_NEW",
      isolationLevel: "SERIALIZABLE"
    })
    expect(typeof returned.value).toBe("function")
  })

  it("should run the method inside a transaction when UnitOfWork.instance is set", async () => {
    const descriptor = {
      value(this: { calls: number }) {
        this.calls += 1
        return this.calls
      }
    } as unknown as PropertyDescriptor

    const transactionSpy = vi.fn((callback: () => unknown) => callback())
    UnitOfWork.instance = {
      transaction: transactionSpy
    } as unknown as UnitOfWork

    Transactional()(Target.prototype, "method", descriptor)

    const receiver = { calls: 0 }
    const result = await (descriptor.value as unknown as (...args: unknown[]) => unknown).call(receiver)

    expect(result).toBe(1)
    expect(transactionSpy).toHaveBeenCalledTimes(1)
  })

  it("should throw when UnitOfWork.instance is not set", async () => {
    const descriptor = {
      value: () => "ok"
    } as unknown as PropertyDescriptor

    Transactional()(Target.prototype, "method", descriptor)

    await expect((descriptor.value as unknown as (...args: unknown[]) => unknown)()).rejects.toThrow(
      /UnitOfWork.instance is not set/
    )
  })

  it("should forward options to the unit of work transaction", async () => {
    const descriptor = {
      value: () => "ok"
    } as unknown as PropertyDescriptor

    const transactionSpy = vi.fn((callback: () => unknown) => callback())
    UnitOfWork.instance = {
      transaction: transactionSpy
    } as unknown as UnitOfWork

    const options = {
      propagation: "MANDATORY" as const,
      isolationLevel: "SERIALIZABLE" as const
    }
    Transactional(options)(Target.prototype, "method", descriptor)

    await (descriptor.value as unknown as (...args: unknown[]) => unknown)()

    expect(transactionSpy).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining(options))
  })
})
