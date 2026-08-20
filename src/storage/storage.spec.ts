import { describe, expect, it, vi, beforeEach } from "vitest"
import { Readable } from "stream"
import { S3Client } from "@aws-sdk/client-s3"
import { Storage } from "./storage.js"
import { StorageKey } from "./storage-key.js"

vi.mock("../config/index.js", () => ({
  config: {
    s3: {
      bucket: "test-bucket"
    }
  }
}))

vi.mock("@aws-sdk/lib-storage", () => ({
  Upload: vi.fn()
}))

import { Upload } from "@aws-sdk/lib-storage"

function createMocks() {
  const send = vi.fn()
  const s3 = { send } as unknown as S3Client
  return { s3, send }
}

describe("Storage", () => {
  let mocks: ReturnType<typeof createMocks>
  let storage: Storage

  beforeEach(() => {
    mocks = createMocks()
    storage = new Storage(mocks.s3)
    vi.clearAllMocks()

    vi.mocked(Upload).mockImplementation(function (options: unknown) {
      const body = (options as { params: { Body: Readable } }).params.Body
      return {
        done: vi.fn().mockImplementation(async () => {
          for await (const _chunk of body) {
            // drain
          }
          return {}
        })
      }
    })
  })

  describe("upload", () => {
    it("should upload and return FileMetadata", async () => {
      const stream = Readable.from(["hello"])
      const result = await storage.upload({ key: new StorageKey("avatars", "a.png"), stream })

      expect(Upload).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            Bucket: expect.any(String),
            Key: "avatars/a.png",
            Body: stream
          })
        })
      )
      expect(result.key).toBe("avatars/a.png")
      expect(result.size).toBe(5)
      expect(result.createdAt).toBeInstanceOf(Date)
      expect(result.lastModifiedAt).toBeInstanceOf(Date)
    })

    it("should include headers when provided", async () => {
      const stream = Readable.from(["hello"])
      const result = await storage.upload({
        key: new StorageKey("avatars", "a.png"),
        stream,
        headers: {
          contentType: "image/png",
          cacheControl: "public, max-age=3600",
          contentDisposition: 'inline; filename="a.png"',
          contentEncoding: "gzip",
          contentLanguage: "en",
          metadata: { foo: "bar" }
        }
      })

      expect(Upload).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            ContentType: "image/png",
            CacheControl: "public, max-age=3600",
            ContentDisposition: 'inline; filename="a.png"',
            ContentEncoding: "gzip",
            ContentLanguage: "en",
            Metadata: { foo: "bar" }
          })
        })
      )
      expect(result.contentType).toBe("image/png")
      expect(result.metadata).toEqual({ foo: "bar" })
    })

    it("should report the number of bytes sent through the stream", async () => {
      const stream = Readable.from(["hello", "world"])
      const result = await storage.upload({ key: new StorageKey("avatars", "a.txt"), stream })

      expect(result.size).toBe(10)
    })

    it("should abort upload when signal is aborted", async () => {
      const abort = new AbortController()
      const stream = Readable.from(["hello"])
      let abortFn!: () => Promise<void>
      vi.mocked(Upload).mockImplementationOnce(function () {
        const done = vi.fn().mockImplementation(async function (this: { abort: () => Promise<void> }) {
          await new Promise<void>(resolve => { abort.signal.addEventListener("abort", () => { resolve(); }, { once: true }); })
          throw new Error("Upload aborted")
        })
        const inst = { done, abort: vi.fn().mockResolvedValue(undefined) } as unknown as InstanceType<typeof Upload>
        abortFn = inst.abort
        return inst
      })

      const promise = storage.upload({ key: new StorageKey("avatars", "a.png"), stream, signal: abort.signal })
      await new Promise(resolve => setImmediate(resolve))
      abort.abort()
      await expect(promise).rejects.toThrow("Upload aborted")
      expect(abortFn).toHaveBeenCalled()
    })

    it("should abort immediately if signal already aborted", async () => {
      const abort = new AbortController()
      abort.abort()
      const stream = Readable.from(["hello"])
      const uploadAbort = vi.fn().mockResolvedValue(undefined)
      vi.mocked(Upload).mockImplementationOnce(function () {
        return {
          done: vi.fn().mockImplementation(async () => {
            throw new Error("Upload aborted")
          }),
          abort: uploadAbort
        } as unknown as InstanceType<typeof Upload>
      })

      await expect(storage.upload({ key: new StorageKey("avatars", "a.png"), stream, signal: abort.signal })).rejects.toThrow("Upload aborted")
      expect(uploadAbort).toHaveBeenCalled()
    })
  })

  describe("getFileMetadata", () => {
    it("should return metadata from HeadObject only", async () => {
      const lastModified = new Date("2026-01-01T00:00:00Z")
      mocks.send.mockResolvedValue({
        ContentLength: 123,
        ContentType: "image/png",
        ContentEncoding: "gzip",
        ContentLanguage: "en",
        ContentDisposition: "inline",
        LastModified: lastModified,
        Metadata: { foo: "bar" }
      })

      const result = await storage.getFileMetadata(new StorageKey("avatars", "a.png"))

      expect(mocks.send).toHaveBeenCalledTimes(1)
      expect(result).toEqual({
        key: "avatars/a.png",
        contentType: "image/png",
        contentEncoding: "gzip",
        contentLanguage: "en",
        contentDisposition: "inline",
        createdAt: undefined,
        lastModifiedAt: lastModified,
        size: 123,
        metadata: { foo: "bar" }
      })
    })
  })

  describe("list", () => {
    it("should list all objects across pages", async () => {
      const lastModified = new Date("2026-01-01T00:00:00Z")
      mocks.send
        .mockResolvedValueOnce({
          Contents: [{ Key: "avatars/a.png", Size: 1 }],
          NextContinuationToken: "token-1"
        })
        .mockResolvedValueOnce({
          ContentLength: 1,
          ContentType: "image/png",
          LastModified: lastModified,
          Metadata: { a: "1" }
        })
        .mockResolvedValueOnce({
          Contents: [{ Key: "avatars/b.png", Size: 2 }],
          NextContinuationToken: undefined
        })
        .mockResolvedValueOnce({
          ContentLength: 2,
          ContentType: "image/png",
          LastModified: lastModified,
          Metadata: { b: "2" }
        })

      const result = await storage.list("avatars")

      expect(mocks.send).toHaveBeenCalledTimes(4)
      expect(result).toEqual([
        {
          key: "avatars/a.png",
          contentType: "image/png",
          contentEncoding: undefined,
          contentLanguage: undefined,
          contentDisposition: undefined,
          createdAt: undefined,
          lastModifiedAt: lastModified,
          size: 1,
          metadata: { a: "1" }
        },
        {
          key: "avatars/b.png",
          contentType: "image/png",
          contentEncoding: undefined,
          contentLanguage: undefined,
          contentDisposition: undefined,
          createdAt: undefined,
          lastModifiedAt: lastModified,
          size: 2,
          metadata: { b: "2" }
        }
      ])
    })

    it("should skip objects without a key", async () => {
      mocks.send.mockResolvedValue({
        Contents: [{ Size: 1 }],
        NextContinuationToken: undefined
      })

      const result = await storage.list("avatars")

      expect(result).toEqual([])
    })
  })

  describe("delete", () => {
    it("should delete the object with the sanitized key", async () => {
      mocks.send.mockResolvedValue({})

      await storage.delete(new StorageKey("avatars", "../evil.png"))

      const [command] = mocks.send.mock.calls[0] as [{ input: { Key: string } }]
      expect(command.input.Key).toBe("avatars/..evil.png")
    })
  })

  describe("copy", () => {
    it("should copy an object and return metadata of the destination", async () => {
      const lastModified = new Date("2026-01-01T00:00:00Z")
      mocks.send
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          ContentLength: 123,
          ContentType: "image/png",
          ContentEncoding: "gzip",
          ContentLanguage: "en",
          ContentDisposition: "inline",
          LastModified: lastModified,
          Metadata: { foo: "bar" }
        })

      const result = await storage.copy({
        source: new StorageKey("avatars", "a.png"),
        destination: new StorageKey("backups", "a.png")
      })

      expect(mocks.send).toHaveBeenCalledTimes(2)
      const [copyCommand] = mocks.send.mock.calls[0] as [{ input: { CopySource: string; Key: string } }]
      expect(copyCommand.input.CopySource).toBe("test-bucket/avatars/a.png")
      expect(copyCommand.input.Key).toBe("backups/a.png")
      expect(result).toEqual({
        key: "backups/a.png",
        contentType: "image/png",
        contentEncoding: "gzip",
        contentLanguage: "en",
        contentDisposition: "inline",
        createdAt: undefined,
        lastModifiedAt: lastModified,
        size: 123,
        metadata: { foo: "bar" }
      })
    })

    it("should apply headers with MetadataDirective REPLACE when provided", async () => {
      mocks.send
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          ContentLength: 10,
          ContentType: "image/webp",
          LastModified: new Date("2026-01-01T00:00:00Z"),
          Metadata: { foo: "bar" }
        })

      const result = await storage.copy({
        source: new StorageKey("avatars", "a.png"),
        destination: new StorageKey("backups", "a.png"),
        headers: {
          contentType: "image/webp",
          cacheControl: "public, max-age=3600",
          metadata: { new: "meta" }
        }
      })

      const [copyCommand] = mocks.send.mock.calls[0] as [{ input: { MetadataDirective?: string; ContentType?: string; CacheControl?: string; Metadata?: Record<string, string> } }]
      expect(copyCommand.input.MetadataDirective).toBe("REPLACE")
      expect(copyCommand.input.ContentType).toBe("image/webp")
      expect(copyCommand.input.CacheControl).toBe("public, max-age=3600")
      expect(copyCommand.input.Metadata).toEqual({ new: "meta" })
      expect(result.contentType).toBe("image/webp")
      expect(result.metadata).toEqual({ new: "meta" })
    })

    it("should omit MetadataDirective when no headers provided", async () => {
      mocks.send
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ ContentLength: 1 })

      await storage.copy({
        source: new StorageKey("avatars", "a.png"),
        destination: new StorageKey("backups", "a.png")
      })

      const [copyCommand] = mocks.send.mock.calls[0] as [{ input: { MetadataDirective?: string } }]
      expect(copyCommand.input.MetadataDirective).toBeUndefined()
    })

    it("should use sanitized keys for source and destination", async () => {
      mocks.send
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ ContentLength: 1 })

      await storage.copy({
        source: new StorageKey("avatars", "../evil.png"),
        destination: new StorageKey("backups", "a/../../etc.png")
      })

      const [copyCommand] = mocks.send.mock.calls[0] as [{ input: { CopySource: string; Key: string } }]
      expect(copyCommand.input.CopySource).toBe("test-bucket/avatars/..evil.png")
      expect(copyCommand.input.Key).toBe("backups/a....etc.png")
    })
  })

  describe("key sanitization", () => {
    it("should strip unsafe characters from collection and name", async () => {
      mocks.send.mockResolvedValue({ ContentLength: 1 })

      await storage.getFileMetadata(new StorageKey("../avatars", "a/../../etc.png"))

      const [command] = mocks.send.mock.calls[0] as [{ input: { Key: string } }]
      expect(command.input.Key).toBe("..avatars/a....etc.png")
    })
  })
})
