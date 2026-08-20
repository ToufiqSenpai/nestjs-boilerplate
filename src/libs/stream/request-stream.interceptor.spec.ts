import "reflect-metadata"
import { describe, expect, it, vi } from "vitest"
import { PassThrough } from "stream"
import type { CallHandler, ExecutionContext } from "@nestjs/common"
import { of } from "rxjs"
import { RequestStreamInterceptor } from "./request-stream.interceptor.js"
import { SizeLimitingValidator } from "./stream-validator.js"
import { StreamValidationException } from "./stream-validation.exception.js"

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer[]> {
  const chunks: Buffer[] = []
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(chunk)
  }
  return chunks
}

function makeReq(): PassThrough & { headers: Record<string, string>; method: string } {
  const req = new PassThrough() as PassThrough & { headers: Record<string, string>; method: string }
  req.headers = { "content-type": "application/octet-stream" }
  req.method = "POST"
  return req
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

describe("RequestStreamInterceptor", () => {
  it("should pass chunks through when validators pass", async () => {
    const req = makeReq()
    const interceptor = new RequestStreamInterceptor([])
    const ctx = makeCtx(req)
    const next: CallHandler = { handle: () => of({}) }

    void interceptor.intercept(ctx, next)
    req.end("hello")

    const chunks = await collect(req)
    expect(Buffer.concat(chunks).toString()).toBe("hello")
  })

  it("should reject when a validator rejects", async () => {
    const req = makeReq()
    const interceptor = new RequestStreamInterceptor([new SizeLimitingValidator(5)])
    const ctx = makeCtx(req)
    const next: CallHandler = { handle: () => of({}) }

    void interceptor.intercept(ctx, next)
    req.end(Buffer.alloc(10))

    await expect(collect(req)).rejects.toThrow(StreamValidationException)
  })

  it("should keep request metadata accessible", async () => {
    const req = makeReq()
    const interceptor = new RequestStreamInterceptor([])
    const ctx = makeCtx(req)
    const next: CallHandler = { handle: () => of({}) }

    void interceptor.intercept(ctx, next)

    expect(req.headers["content-type"]).toBe("application/octet-stream")
    expect(req.method).toBe("POST")
  })

  it("should forward validation error to req error listeners", async () => {
    const req = makeReq()
    const interceptor = new RequestStreamInterceptor([new SizeLimitingValidator(5)])
    const ctx = makeCtx(req)
    const next: CallHandler = { handle: () => of({}) }
    const onError = vi.fn()

    void interceptor.intercept(ctx, next)
    req.on("error", onError)
    req.end(Buffer.alloc(10))

    await expect(collect(req)).rejects.toThrow(StreamValidationException)
    expect(onError).toHaveBeenCalled()
  })
})
