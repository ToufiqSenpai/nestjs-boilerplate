import { describe, expect, it, vi, beforeEach } from "vitest"
import { of, throwError, lastValueFrom } from "rxjs"
import { z } from "zod"
import { PassThrough } from "stream"
import { EventEmitter } from "events"
import type { ExecutionContext, CallHandler } from "@nestjs/common"

vi.mock("../../config/index.js", () => ({
  config: { s3: { bucket: "test-bucket" } }
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

function makeCtx(req: unknown, schema: z.ZodType): ExecutionContext {
  const handler = () => {}
  const key = `${RouteParamtypes.BODY}:0`
  vi.spyOn(Reflect, "getMetadata").mockImplementation((metadataKey: unknown) => {
    if (metadataKey === ROUTE_ARGS_METADATA) {
      return { [key]: { index: 0, data: undefined, pipes: [], schema } } as unknown as ReturnType<typeof Reflect.getMetadata>
    }
    return undefined as unknown as ReturnType<typeof Reflect.getMetadata>
  })
  return {
    switchToHttp: () => ({ getRequest: () => req as import("express").Request }),
    getHandler: () => handler,
    getClass: () => class {},
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => null as unknown as ReturnType<ExecutionContext["switchToRpc"]>,
    switchToWs: () => null as unknown as ReturnType<ExecutionContext["switchToWs"]>,
    getType: () => "http"
  } as unknown as ExecutionContext
}

describe("FormInterceptor", () => {
  let storage: Storage
  let interceptor: FormInterceptor

  beforeEach(() => {
    vi.clearAllMocks()
    storage = {
      upload: vi.fn().mockResolvedValue({ key: "avatars/test.png", size: 5, contentType: "image/png", metadata: {} }),
      delete: vi.fn().mockResolvedValue(undefined)
    } as unknown as Storage
    interceptor = new FormInterceptor(storage)
  })

  it("should throw if no form schema on handler", async () => {
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
      getHandler: () => () => {},
      getClass: () => class {},
      getArgs: () => [],
      getArgByIndex: () => undefined,
      switchToRpc: () => null as unknown as ReturnType<ExecutionContext["switchToRpc"]>,
      switchToWs: () => null as unknown as ReturnType<ExecutionContext["switchToWs"]>,
      getType: () => "http"
    } as unknown as ExecutionContext
    vi.spyOn(Reflect, "getMetadata").mockReturnValue({} as unknown as ReturnType<typeof Reflect.getMetadata>)

    const next: CallHandler = { handle: () => of({}) }
    await expect(interceptor.intercept(ctx, next)).rejects.toThrow("Missing form schema")
  })

  it("should parse fields and files, set req.body, and return Observable", async () => {
    const fileSchema = createFileSchema({ mimetype: ["image/png"], maxSize: 1024 * 1024, collection: "avatars" })
    const schema = z.object({ title: z.string(), avatar: fileSchema })

    const busboy = makeBusboy()
    const req = makeReq(busboy) as unknown as import("express").Request
    const ctx = makeCtx(req, schema)
    const next: CallHandler = { handle: () => of({ ok: true }) }

    const promise = interceptor.intercept(ctx, next)

    setImmediate(() => {
      busboy.emit("field", "title", "hello")
      const fileStream = new PassThrough()
      busboy.emit("file", "avatar", fileStream as unknown as NodeJS.ReadableStream, "a.png", "7bit", "image/png")
      fileStream.end("hello")
      setImmediate(() => busboy.emit("finish"))
    })

    const obs = await promise
    const result = await lastValueFrom(obs)
    expect(result).toEqual({ ok: true })
    expect((req as unknown as { body: unknown }).body).toBeDefined()
    expect(storage.upload).toHaveBeenCalledOnce()
    const uploadArg = vi.mocked(storage.upload).mock.calls[0][0] as { key: StorageKey; headers: { contentType: string } }
    expect(uploadArg.key).toBeInstanceOf(StorageKey)
    expect(uploadArg.key.collection).toBe("avatars")
    expect(uploadArg.headers.contentType).toBe("image/png")
  })

  it("should rollback on schema parse failure and throw", async () => {
    const fileSchema = createFileSchema({ mimetype: ["image/png"], maxSize: 10, collection: "avatars" })
    const schema = z.object({ title: z.string().min(5), avatar: fileSchema })

    const busboy = makeBusboy()
    const req = makeReq(busboy) as unknown as import("express").Request
    const ctx = makeCtx(req, schema)
    const next: CallHandler = { handle: () => throwError(() => new Error("validation failed")) }

    const promise = interceptor.intercept(ctx, next)

    setImmediate(() => {
      busboy.emit("field", "title", "hi")
      const fileStream = new PassThrough()
      busboy.emit("file", "avatar", fileStream as unknown as NodeJS.ReadableStream, "a.png", "7bit", "image/png")
      fileStream.end("hello")
      setImmediate(() => busboy.emit("finish"))
    })

    const obs = await promise
    await expect(lastValueFrom(obs)).rejects.toThrow("validation failed")
    expect(storage.delete).toHaveBeenCalled()
  })

  it("should rollback when next.handle throws and rethrow", async () => {
    const fileSchema = createFileSchema({ mimetype: ["image/png"], maxSize: 1024 * 1024, collection: "avatars" })
    const schema = z.object({ avatar: fileSchema })

    const busboy = makeBusboy()
    const req = makeReq(busboy) as unknown as import("express").Request
    const ctx = makeCtx(req, schema)
    const next: CallHandler = { handle: () => throwError(() => new Error("handler failed")) }

    const promise = interceptor.intercept(ctx, next)

    setImmediate(() => {
      const fileStream = new PassThrough()
      busboy.emit("file", "avatar", fileStream as unknown as NodeJS.ReadableStream, "a.png", "7bit", "image/png")
      fileStream.end("hello")
      setImmediate(() => busboy.emit("finish"))
    })

    const obs = await promise
    await expect(lastValueFrom(obs)).rejects.toThrow("handler failed")
    expect(storage.delete).toHaveBeenCalled()
  })

  it("should skip unknown file field and not upload", async () => {
    const schema = z.object({ title: z.string() })

    const busboy = makeBusboy()
    const req = makeReq(busboy) as unknown as import("express").Request
    const ctx = makeCtx(req, schema)
    const next: CallHandler = { handle: () => of({}) }

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
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it("should throw PayloadTooLargeException when streaming exceeds maxSize", async () => {
    const fileSchema = createFileSchema({ mimetype: ["image/png"], maxSize: 5, collection: "avatars" })
    const schema = z.object({ avatar: fileSchema })

    const busboy = makeBusboy()
    const req = makeReq(busboy) as unknown as import("express").Request
    const ctx = makeCtx(req, schema)
    const next: CallHandler = { handle: () => of({}) }

    storage.upload = vi.fn().mockImplementation(async ({ stream }: { stream: NodeJS.ReadableStream }) => {
      for await (const _ of stream as AsyncIterable<Buffer>) {
      }
      return { key: "avatars/test.png", size: 6, contentType: "image/png", metadata: {} }
    }) as unknown as typeof storage.upload

    const promise = interceptor.intercept(ctx, next)

    setImmediate(() => {
      const fileStream = new PassThrough()
      busboy.emit("file", "avatar", fileStream as unknown as NodeJS.ReadableStream, "a.png", "7bit", "image/png")
      fileStream.write(Buffer.alloc(3, "a"))
      fileStream.write(Buffer.alloc(3, "a"))
      fileStream.end()
      setImmediate(() => busboy.emit("finish"))
    })

    await expect(promise).rejects.toThrow(/exceeds 5 bytes/)
    expect(storage.upload).toHaveBeenCalled()
  })

  it("should handle multiple field values via appendParsedForm", async () => {
    const fileSchema = createFileSchema({ mimetype: ["image/png"], maxSize: 1024 * 1024, collection: "avatars" })
    const schema = z.object({ title: z.string(), avatars: fileSchema.array() })

    const busboy = makeBusboy()
    const req = makeReq(busboy) as unknown as import("express").Request
    const ctx = makeCtx(req, schema)
    const next: CallHandler = { handle: () => of({}) }

    vi.mocked(storage.upload)
      .mockResolvedValueOnce({ key: "avatars/a.png", size: 2 } as unknown as Awaited<ReturnType<Storage["upload"]>>)
      .mockResolvedValueOnce({ key: "avatars/b.png", size: 2 } as unknown as Awaited<ReturnType<Storage["upload"]>>)

    const promise = interceptor.intercept(ctx, next)

    setImmediate(() => {
      busboy.emit("field", "title", "hello")
      const s1 = new PassThrough()
      const s2 = new PassThrough()
      busboy.emit("file", "avatars", s1 as unknown as NodeJS.ReadableStream, "a.png", "7bit", "image/png")
      busboy.emit("file", "avatars", s2 as unknown as NodeJS.ReadableStream, "b.png", "7bit", "image/png")
      s1.end("hi")
      s2.end("hi")
      setImmediate(() => busboy.emit("finish"))
    })

    const obs = await promise
    await lastValueFrom(obs)
    expect(storage.upload).toHaveBeenCalledTimes(2)
    const body = (req as unknown as { body: { avatars: unknown[] } }).body
    expect(body.avatars).toHaveLength(2)
  })
})
