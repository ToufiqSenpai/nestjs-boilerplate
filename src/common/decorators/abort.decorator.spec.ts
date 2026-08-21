import "reflect-metadata"
import { PassThrough } from "stream"
import { ExecutionContext } from "@nestjs/common"
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants"
import { Abort } from "./abort.decorator.js"

function getAbortFactory(): (data: unknown, ctx: ExecutionContext) => AbortController {
  const target = class {}
  const key = "test"
  Abort()(target, key, 0)
  const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, target.constructor, key) as
    | Record<string, { factory?: (data: unknown, ctx: ExecutionContext) => AbortController }>
    | undefined
  const entry = metadata ? Object.values(metadata)[0] : undefined
  if (!entry?.factory) throw new Error("Abort factory not found in metadata")
  return entry.factory
}

function makeCtx(req: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => {},
    getClass: () => class {},
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => null as unknown as ReturnType<ExecutionContext["switchToRpc"]>,
    switchToWs: () => null as unknown as ReturnType<ExecutionContext["switchToWs"]>,
    getType: () => "http"
  } as unknown as ExecutionContext
}

describe("Abort decorator", () => {
  it("should return the same controller for the same request", () => {
    const req = new PassThrough()
    const factory = getAbortFactory()

    const first = factory(undefined, makeCtx(req))
    const second = factory(undefined, makeCtx(req))

    expect(first).toBe(second)
  })

  it("should abort when request emits error", () => {
    const req = new PassThrough()
    const factory = getAbortFactory()

    const controller = factory(undefined, makeCtx(req))
    req.emit("error", new Error("boom"))

    expect(controller.signal.aborted).toBe(true)
  })

  it("should attach the error listener only once per request", () => {
    const req = new PassThrough()
    const factory = getAbortFactory()

    factory(undefined, makeCtx(req))
    factory(undefined, makeCtx(req))

    expect(req.listenerCount("error")).toBe(1)
  })

  it("should create separate controllers for different requests", () => {
    const factory = getAbortFactory()
    const reqA = new PassThrough()
    const reqB = new PassThrough()

    const controllerA = factory(undefined, makeCtx(reqA))
    const controllerB = factory(undefined, makeCtx(reqB))

    expect(controllerA).not.toBe(controllerB)
  })
})
