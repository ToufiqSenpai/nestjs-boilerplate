import "reflect-metadata"
import { vi } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"
import { Test } from "@nestjs/testing"
import { PassThrough } from "stream"
import type {
  CallHandler,
  ExecutionContext,
  HttpArgumentsHost,
  RpcArgumentsHost,
  WsArgumentsHost
} from "@nestjs/common"
import { of } from "rxjs"
import { RequestStreamInterceptor } from "./request-stream.interceptor.js"
import { SizeLimitingValidator } from "./stream-validator.js"
import type { StreamValidator } from "./stream-validator.js"
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

function makeCtx(req: unknown): MockProxy<ExecutionContext> {
  const ctx = mock<ExecutionContext>()
  const httpHost = mock<HttpArgumentsHost>()
  httpHost.getRequest.mockReturnValue(req)
  ctx.switchToHttp.mockReturnValue(httpHost)
  ctx.getHandler.mockReturnValue(() => {})
  ctx.getClass.mockReturnValue(class {})
  ctx.getArgs.mockReturnValue([])
  ctx.getArgByIndex.mockReturnValue(undefined)
  ctx.switchToRpc.mockReturnValue(mock<RpcArgumentsHost>())
  ctx.switchToWs.mockReturnValue(mock<WsArgumentsHost>())
  ctx.getType.mockReturnValue("http")
  return ctx
}

async function createInterceptor(
  validators: StreamValidator[] = []
): Promise<RequestStreamInterceptor> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      {
        provide: RequestStreamInterceptor,
        useFactory: () => new RequestStreamInterceptor(validators)
      }
    ]
  }).compile()
  return moduleRef.get(RequestStreamInterceptor)
}

describe("RequestStreamInterceptor", () => {
  it("should pass chunks through when validators pass", async () => {
    const req = makeReq()
    const interceptor = await createInterceptor([])
    const ctx = makeCtx(req)
    const next = mock<CallHandler>()
    next.handle.mockReturnValue(of({}))

    void interceptor.intercept(ctx, next)
    req.end("hello")

    const chunks = await collect(req)
    expect(Buffer.concat(chunks).toString()).toBe("hello")
  })

  it("should reject when a validator rejects", async () => {
    const req = makeReq()
    const interceptor = await createInterceptor([new SizeLimitingValidator(5)])
    const ctx = makeCtx(req)
    const next = mock<CallHandler>()
    next.handle.mockReturnValue(of({}))

    void interceptor.intercept(ctx, next)
    req.end(Buffer.alloc(10))

    await expect(collect(req)).rejects.toThrow(StreamValidationException)
  })

  it("should keep request metadata accessible", async () => {
    const req = makeReq()
    const interceptor = await createInterceptor([])
    const ctx = makeCtx(req)
    const next = mock<CallHandler>()
    next.handle.mockReturnValue(of({}))

    void interceptor.intercept(ctx, next)

    expect(req.headers["content-type"]).toBe("application/octet-stream")
    expect(req.method).toBe("POST")
  })

  it("should forward validation error to req error listeners", async () => {
    const req = makeReq()
    const interceptor = await createInterceptor([new SizeLimitingValidator(5)])
    const ctx = makeCtx(req)
    const next = mock<CallHandler>()
    next.handle.mockReturnValue(of({}))
    const onError = vi.fn()

    void interceptor.intercept(ctx, next)
    req.on("error", onError)
    req.end(Buffer.alloc(10))

    await expect(collect(req)).rejects.toThrow(StreamValidationException)
    expect(onError).toHaveBeenCalled()
  })
})
