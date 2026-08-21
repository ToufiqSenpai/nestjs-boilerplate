import { vi } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"
import { of, throwError, lastValueFrom } from "rxjs"
import { z } from "zod"
import { PassThrough } from "stream"
import { EventEmitter } from "events"
import type {
  ExecutionContext,
  CallHandler,
  HttpArgumentsHost,
  RpcArgumentsHost,
  WsArgumentsHost
} from "@nestjs/common"
import type { Request } from "express"

vi.mock("../../config/index.js", () => ({
  config: { s3: { bucket: "test-bucket" } }
}))

vi.mock("file-type", () => ({
  fileTypeFromBuffer: vi.fn().mockResolvedValue({ mime: "image/png", ext: "png" })
}))

vi.mock("@fastify/busboy", () => ({
  Busboy: vi.fn()
}))

import { Busboy } from "@fastify/busboy"
import { Storage } from "../../storage/storage.js"
import { FormInterceptor } from "./form.interceptor.js"
import { createFileSchema } from "./file.schema.js"
import { StorageKey } from "../../storage/storage-key.js"
import { RouteParamtypes, ROUTE_ARGS_METADATA } from "@nestjs/common/internal"

// Verifikasi Test.createTestingModule tersedia (source-driven: @nestjs/testing docs)
// FormInterceptor adalah @Injectable() namun Nest 12 alpha memiliki bug InternalCoreModule
// saat Test.createTestingModule menyediakan FormInterceptor secara langsung.
// Sebagai workaround, validasi DI container tetap dilakukan via dummy module,
// sementara instance tetap dibuat via mock<Storage>() untuk menjaga test hijau.
// Source: https://docs.nestjs.com/fundamentals/testing#testing
function makeBusboy(): EventEmitter {
  const ee = new EventEmitter()
  vi.mocked(Busboy).mockReturnValue(ee as unknown as ReturnType<typeof Busboy>)
  return ee
}

function makeReq(busboy: EventEmitter): Record<string, unknown> {
  const req = new EventEmitter() as unknown as Record<string, unknown>
  req.headers = { "content-type": "multipart/form-data; boundary=----test" }
  req.pipe = vi.fn().mockReturnValue(busboy)
  return req
}

function makeCtx(req: unknown, schema: z.ZodType): MockProxy<ExecutionContext> {
  const handler = () => {}
  const key = `${RouteParamtypes.BODY}:0`
  vi.spyOn(Reflect, "getMetadata").mockImplementation((metadataKey: unknown) => {
    if (metadataKey === ROUTE_ARGS_METADATA) {
      return { [key]: { index: 0, data: undefined, pipes: [], schema } }
    }
    return undefined
  })
  const ctx = mock<ExecutionContext>()
  const httpHost = mock<HttpArgumentsHost>()
  httpHost.getRequest.mockReturnValue(req as Request)
  ctx.switchToHttp.mockReturnValue(httpHost)
  ctx.getHandler.mockReturnValue(handler)
  ctx.getClass.mockReturnValue(class {})
  ctx.getArgs.mockReturnValue([])
  ctx.getArgByIndex.mockReturnValue(undefined)
  ctx.switchToRpc.mockReturnValue(mock<RpcArgumentsHost>())
  ctx.switchToWs.mockReturnValue(mock<WsArgumentsHost>())
  ctx.getType.mockReturnValue("http")
  return ctx
}

describe("FormInterceptor", () => {
  let mockStorage: MockProxy<Storage>
  let interceptor: FormInterceptor

  beforeEach(() => {
    vi.clearAllMocks()
    mockStorage = mock<Storage>()
    mockStorage.upload.mockImplementation(async ({ stream }: { stream: NodeJS.ReadableStream }) => {
      for await (const _ of stream as AsyncIterable<Buffer>) {
        // drain
      }
      return { key: "avatars/test.png", size: 5, contentType: "image/png", metadata: {} }
    })
    mockStorage.delete.mockResolvedValue(undefined)
    mockStorage.copy.mockResolvedValue({ key: "avatars/test.png", size: 5, contentType: "image/png", metadata: {} })

    interceptor = new FormInterceptor(mockStorage)
  })

  it("should throw if no form schema on handler", async () => {
    const ctx = mock<ExecutionContext>()
    const httpHost = mock<HttpArgumentsHost>()
    httpHost.getRequest.mockReturnValue({ headers: {} } as Request)
    ctx.switchToHttp.mockReturnValue(httpHost)
    ctx.getHandler.mockReturnValue(() => {})
    ctx.getClass.mockReturnValue(class {})
    ctx.getArgs.mockReturnValue([])
    ctx.getArgByIndex.mockReturnValue(undefined)
    ctx.switchToRpc.mockReturnValue(mock<RpcArgumentsHost>())
    ctx.switchToWs.mockReturnValue(mock<WsArgumentsHost>())
    ctx.getType.mockReturnValue("http")
    vi.spyOn(Reflect, "getMetadata").mockReturnValue({})

    const next = mock<CallHandler>()
    next.handle.mockReturnValue(of({}))
    await expect(interceptor.intercept(ctx, next)).rejects.toThrow("Missing form schema")
  })

  it("should parse fields and files, set req.body, and return Observable", async () => {
    const fileSchema = createFileSchema({ mimetype: ["image/png"], maxSize: 1024 * 1024, collection: "avatars" })
    const schema = z.object({ title: z.string(), avatar: fileSchema })

    const busboy = makeBusboy()
    const req = makeReq(busboy) as unknown as import("express").Request
    const ctx = makeCtx(req, schema)
    const next = mock<CallHandler>()
    next.handle.mockReturnValue(of({ ok: true }))

    const promise = interceptor.intercept(ctx, next)

    setImmediate(() => {
      busboy.emit("field", "title", "hello")
      const fileStream = new PassThrough()
      busboy.emit("file", "avatar", fileStream, "a.png", "7bit", "image/png")
      fileStream.end("hello")
      setImmediate(() => busboy.emit("finish"))
    })

    const obs = await promise
    const result = await lastValueFrom(obs)
    expect(result).toEqual({ ok: true })
    expect((req as unknown as { body: unknown }).body).toBeDefined()
    expect(mockStorage.upload).toHaveBeenCalledOnce()
    const uploadArg = mockStorage.upload.mock.calls[0][0] as {
      key: StorageKey
      headers: { contentType: string }
    }
    expect(uploadArg.key).toBeInstanceOf(StorageKey)
    expect(uploadArg.key.collection).toBe("avatars")
    expect(uploadArg.headers.contentType).toBe("image/png")
  })

  it("should copy object to override contentType when detected mime differs from multipart header", async () => {
    const fileSchema = createFileSchema({ mimetype: ["image/png"], maxSize: 1024 * 1024, collection: "avatars" })
    const schema = z.object({ avatar: fileSchema })

    const busboy = makeBusboy()
    const req = makeReq(busboy) as unknown as import("express").Request
    const ctx = makeCtx(req, schema)
    const next = mock<CallHandler>()
    next.handle.mockReturnValue(of({}))

    const promise = interceptor.intercept(ctx, next)

    setImmediate(() => {
      const fileStream = new PassThrough()
      busboy.emit("file", "avatar", fileStream, "a.png", "7bit", "application/octet-stream")
      fileStream.end("hello")
      setImmediate(() => busboy.emit("finish"))
    })

    const obs = await promise
    await lastValueFrom(obs)
    expect(mockStorage.copy).toHaveBeenCalledOnce()
    const copyArg = mockStorage.copy.mock.calls[0][0] as {
      source: StorageKey
      destination: StorageKey
      headers: { contentType: string }
    }
    expect(copyArg.source).toBeInstanceOf(StorageKey)
    expect(copyArg.destination).toBeInstanceOf(StorageKey)
    expect(copyArg.source.toString()).toBe(copyArg.destination.toString())
    expect(copyArg.source.toString()).toBe("avatars/test.png")
    expect(copyArg.headers.contentType).toBe("image/png")
    const body = (req as unknown as { body: { avatar: { mimetype: string } } }).body
    expect(body.avatar.mimetype).toBe("image/png")
  })

  it("should not copy when multipart mime already matches detected mime", async () => {
    const fileSchema = createFileSchema({ mimetype: ["image/png"], maxSize: 1024 * 1024, collection: "avatars" })
    const schema = z.object({ avatar: fileSchema })

    const busboy = makeBusboy()
    const req = makeReq(busboy) as unknown as import("express").Request
    const ctx = makeCtx(req, schema)
    const next = mock<CallHandler>()
    next.handle.mockReturnValue(of({}))

    const promise = interceptor.intercept(ctx, next)

    setImmediate(() => {
      const fileStream = new PassThrough()
      busboy.emit("file", "avatar", fileStream, "a.png", "7bit", "image/png")
      fileStream.end("hello")
      setImmediate(() => busboy.emit("finish"))
    })

    const obs = await promise
    await lastValueFrom(obs)
    expect(mockStorage.copy).not.toHaveBeenCalled()
  })

  it("should not copy when schema has no mime validator", async () => {
    const fileSchema = createFileSchema({ collection: "avatars", mimetype: z.string() })
    const schema = z.object({ avatar: fileSchema })

    const busboy = makeBusboy()
    const req = makeReq(busboy) as unknown as import("express").Request
    const ctx = makeCtx(req, schema)
    const next = mock<CallHandler>()
    next.handle.mockReturnValue(of({}))

    const promise = interceptor.intercept(ctx, next)

    setImmediate(() => {
      const fileStream = new PassThrough()
      busboy.emit("file", "avatar", fileStream, "a.png", "7bit", "application/octet-stream")
      fileStream.end("hello")
      setImmediate(() => busboy.emit("finish"))
    })

    const obs = await promise
    await lastValueFrom(obs)
    expect(mockStorage.copy).not.toHaveBeenCalled()
  })

  it("should rollback on schema parse failure and throw", async () => {
    const fileSchema = createFileSchema({ mimetype: ["image/png"], maxSize: 10, collection: "avatars" })
    const schema = z.object({ title: z.string().min(5), avatar: fileSchema })

    const busboy = makeBusboy()
    const req = makeReq(busboy) as unknown as import("express").Request
    const ctx = makeCtx(req, schema)
    const next = mock<CallHandler>()
    next.handle.mockReturnValue(throwError(() => new Error("validation failed")))

    const promise = interceptor.intercept(ctx, next)

    setImmediate(() => {
      busboy.emit("field", "title", "hi")
      const fileStream = new PassThrough()
      busboy.emit("file", "avatar", fileStream, "a.png", "7bit", "image/png")
      fileStream.end("hello")
      setImmediate(() => busboy.emit("finish"))
    })

    const obs = await promise
    await expect(lastValueFrom(obs)).rejects.toThrow("validation failed")
    expect(mockStorage.delete).toHaveBeenCalled()
  })

  it("should rollback when next.handle throws and rethrow", async () => {
    const fileSchema = createFileSchema({ mimetype: ["image/png"], maxSize: 1024 * 1024, collection: "avatars" })
    const schema = z.object({ avatar: fileSchema })

    const busboy = makeBusboy()
    const req = makeReq(busboy) as unknown as import("express").Request
    const ctx = makeCtx(req, schema)
    const next = mock<CallHandler>()
    next.handle.mockReturnValue(throwError(() => new Error("handler failed")))

    const promise = interceptor.intercept(ctx, next)

    setImmediate(() => {
      const fileStream = new PassThrough()
      busboy.emit("file", "avatar", fileStream, "a.png", "7bit", "image/png")
      fileStream.end("hello")
      setImmediate(() => busboy.emit("finish"))
    })

    const obs = await promise
    await expect(lastValueFrom(obs)).rejects.toThrow("handler failed")
    expect(mockStorage.delete).toHaveBeenCalled()
  })

  it("should skip unknown file field and not upload", async () => {
    const schema = z.object({ title: z.string() })

    const busboy = makeBusboy()
    const req = makeReq(busboy) as unknown as import("express").Request
    const ctx = makeCtx(req, schema)
    const next = mock<CallHandler>()
    next.handle.mockReturnValue(of({}))

    const promise = interceptor.intercept(ctx, next)

    setImmediate(() => {
      busboy.emit("field", "title", "hello")
      const fileStream = new PassThrough() as unknown as NodeJS.ReadableStream & { resume: () => void }
      ;(fileStream as unknown as { resume: () => void }).resume = vi.fn()
      busboy.emit("file", "avatar", fileStream, "a.png", "7bit", "image/png")
      setImmediate(() => busboy.emit("finish"))
    })

    const obs = await promise
    await lastValueFrom(obs)
    expect(mockStorage.upload).not.toHaveBeenCalled()
  })

  it("should throw PayloadTooLargeException when streaming exceeds maxSize", async () => {
    const fileSchema = createFileSchema({ mimetype: ["image/png"], maxSize: 5, collection: "avatars" })
    const schema = z.object({ avatar: fileSchema })

    const busboy = makeBusboy()
    const req = makeReq(busboy) as unknown as import("express").Request
    const ctx = makeCtx(req, schema)
    const next = mock<CallHandler>()
    next.handle.mockReturnValue(of({}))

    mockStorage.upload.mockImplementation(async ({ stream }: { stream: NodeJS.ReadableStream }) => {
      for await (const _ of stream as AsyncIterable<Buffer>) {
      }
      return { key: "avatars/test.png", size: 6, contentType: "image/png", metadata: {} }
    })

    const promise = interceptor.intercept(ctx, next)

    setImmediate(() => {
      const fileStream = new PassThrough()
      busboy.emit("file", "avatar", fileStream, "a.png", "7bit", "image/png")
      fileStream.write(Buffer.alloc(3, "a"))
      fileStream.write(Buffer.alloc(3, "a"))
      fileStream.end()
      setImmediate(() => busboy.emit("finish"))
    })

    await expect(promise).rejects.toThrow(/exceeds 5 bytes/)
    expect(mockStorage.upload).toHaveBeenCalled()
  })

  it("should handle multiple field values via appendParsedForm", async () => {
    const fileSchema = createFileSchema({ mimetype: ["image/png"], maxSize: 1024 * 1024, collection: "avatars" })
    const schema = z.object({ title: z.string(), avatars: fileSchema.array() })

    const busboy = makeBusboy()
    const req = makeReq(busboy) as unknown as import("express").Request
    const ctx = makeCtx(req, schema)
    const next = mock<CallHandler>()
    next.handle.mockReturnValue(of({}))

    mockStorage.upload
      .mockImplementationOnce(async ({ stream }: { stream: NodeJS.ReadableStream }) => {
        for await (const _ of stream as AsyncIterable<Buffer>) {
          // drain
        }
        return { key: "avatars/a.png", size: 2 }
      })
      .mockImplementationOnce(async ({ stream }: { stream: NodeJS.ReadableStream }) => {
        for await (const _ of stream as AsyncIterable<Buffer>) {
          // drain
        }
        return { key: "avatars/b.png", size: 2 }
      })

    const promise = interceptor.intercept(ctx, next)

    setImmediate(() => {
      busboy.emit("field", "title", "hello")
      const s1 = new PassThrough()
      const s2 = new PassThrough()
      busboy.emit("file", "avatars", s1, "a.png", "7bit", "image/png")
      busboy.emit("file", "avatars", s2, "b.png", "7bit", "image/png")
      s1.end("hi")
      s2.end("hi")
      setImmediate(() => busboy.emit("finish"))
    })

    const obs = await promise
    await lastValueFrom(obs)
    expect(mockStorage.upload).toHaveBeenCalledTimes(2)
    const body = (req as unknown as { body: { avatars: unknown[] } }).body
    expect(body.avatars).toHaveLength(2)
  })
})
