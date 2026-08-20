import { describe, expect, it, vi } from "vitest"
import { SizeLimitingValidator, FileTypeValidator } from "./stream-validator.js"
import { StreamValidationException } from "./stream-validation.exception.js"
import { StreamValidation } from "./stream-validation.js"

const PNG_HEADER = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex")
const TEXT_BYTES = Buffer.from("plain text, not a known file type")

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer[]> {
  const chunks: Buffer[] = []
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(chunk)
  }
  return chunks
}

describe("SizeLimitingValidator", () => {
  it("accepts chunks within the limit", () => {
    const validator = new SizeLimitingValidator(10)
    expect(validator.validate(Buffer.alloc(4))).toBe(true)
    expect(validator.validate(Buffer.alloc(6))).toBe(true)
  })

  it("rejects once the accumulated size exceeds the limit", () => {
    const validator = new SizeLimitingValidator(10)
    expect(validator.validate(Buffer.alloc(7))).toBe(true)
    expect(validator.validate(Buffer.alloc(4))).toBe(false)
  })

  it("reports the accumulated size in the message", () => {
    const validator = new SizeLimitingValidator(10)
    validator.validate(Buffer.alloc(12))
    expect(validator.message()).toBe("Stream size 12 exceeds the 10 byte limit.")
  })
})

describe("FileTypeValidator", () => {
  it("accepts an allowed mime type on flush", async () => {
    const validator = new FileTypeValidator(["image/png"])
    validator.validate(PNG_HEADER)
    expect(await validator.flush()).toBe(true)
  })

  it("rejects a mime type that is not allowed", async () => {
    const validator = new FileTypeValidator(["image/jpeg"])
    validator.validate(PNG_HEADER)
    expect(await validator.flush()).toBe(false)
    expect(await validator.message()).toContain("image/png is not allowed")
  })

  it("rejects undetectable content as octet-stream", async () => {
    const validator = new FileTypeValidator(["image/png"])
    validator.validate(TEXT_BYTES)
    expect(await validator.flush()).toBe(false)
    expect(await validator.message()).toBe("Unable to detect file type (got application/octet-stream).")
  })

  it("exposes the detected mime type", async () => {
    const validator = new FileTypeValidator(["image/png"])
    validator.validate(PNG_HEADER)
    const mimePromise = validator.mimeType
    await validator.flush()
    expect(await mimePromise).toBe("image/png")
  })

  it("returns the same verdict when flushed again", async () => {
    const validator = new FileTypeValidator(["image/png"])
    validator.validate(PNG_HEADER)
    expect(await validator.flush()).toBe(true)
    expect(await validator.flush()).toBe(true)
  })
})

describe("StreamValidation", () => {
  it("passes chunks through unchanged when validators pass", async () => {
    const validator = {
      validate: (chunk: Buffer) => chunk.length > 0,
      message: () => "should not be called"
    }
    const stream = new StreamValidation<Buffer>(validator).stream
    stream.end(Buffer.from("hello"))
    const chunks = await collect(stream)
    expect(Buffer.concat(chunks).toString()).toBe("hello")
  })

  it("throws StreamValidationException when a validator rejects a chunk", async () => {
    const validator = {
      validate: (chunk: Buffer) => chunk.length <= 3,
      message: () => "chunk too large"
    }
    const stream = new StreamValidation<Buffer>(validator).stream
    stream.end("way too long")
    await expect(collect(stream)).rejects.toThrow(StreamValidationException)
  })

  it("runs flush validators after the source ends", async () => {
    const flush = vi.fn().mockResolvedValue(true)
    const validator = {
      validate: () => true,
      flush,
      message: () => "flush failed"
    }
    const stream = new StreamValidation<Buffer>(validator).stream
    stream.end("data")
    await collect(stream)
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it("throws StreamValidationException when a flush validator rejects", async () => {
    const validator = {
      validate: () => true,
      flush: () => false,
      message: () => "flush rejected"
    }
    const stream = new StreamValidation<Buffer>(validator).stream
    stream.end("data")
    await expect(collect(stream)).rejects.toThrow(/flush rejected/)
  })

  it("integrates with real validators: passes a PNG stream", async () => {
    const stream = new StreamValidation<Buffer>(new SizeLimitingValidator(1024), new FileTypeValidator(["image/png"]))
      .stream
    stream.end(PNG_HEADER)
    const chunks = await collect(stream)
    expect(Buffer.concat(chunks).equals(PNG_HEADER)).toBe(true)
  })

  it("rejects a stream whose content type is not allowed", async () => {
    const stream = new StreamValidation<Buffer>(new FileTypeValidator(["image/png"])).stream
    stream.end(TEXT_BYTES)
    await expect(collect(stream)).rejects.toThrow(StreamValidationException)
  })

  it("rejects a stream that exceeds the size limit", async () => {
    const stream = new StreamValidation<Buffer>(new SizeLimitingValidator(5)).stream
    stream.end(Buffer.alloc(10))
    await expect(collect(stream)).rejects.toThrow(/exceeds the 5 byte limit/)
  })
})
