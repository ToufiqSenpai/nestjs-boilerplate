import { fileTypeFromBuffer } from "file-type"

export interface StreamValidator<T = unknown> {
  validate(chunk: T): Promise<boolean> | boolean
  flush?(): Promise<boolean> | boolean
  message(): Promise<string> | string
}

export class SizeLimitingValidator implements StreamValidator<Buffer> {
  private currentSize = 0

  public constructor(private readonly maxSize: number) {}

  public validate(chunk: Buffer): boolean {
    this.currentSize += chunk.length
    return this.currentSize <= this.maxSize
  }

  public message(): string {
    return `Stream size ${this.currentSize} exceeds the ${this.maxSize} byte limit.`
  }
}

export class FileTypeValidator implements StreamValidator<Buffer> {
  private readonly SAMPLE_SIZE = 4100
  private head = Buffer.alloc(0)
  private done = false
  private readonly allowed: Set<string>
  private readonly deferred = Promise.withResolvers<string>()

  public constructor(allowedMime: string[]) {
    this.allowed = new Set(allowedMime)
  }

  public get mimeType(): Promise<string> {
    return this.deferred.promise
  }

  public validate(chunk: Buffer): boolean {
    if (this.head.length < this.SAMPLE_SIZE) {
      this.head = Buffer.concat([this.head, chunk.subarray(0, this.SAMPLE_SIZE - this.head.length)])
    }
    return true
  }

  public async flush(): Promise<boolean> {
    if (!this.done) {
      this.done = true
      const detected = this.head.length ? (await fileTypeFromBuffer(this.head))?.mime : undefined
      this.deferred.resolve(detected ?? "application/octet-stream")
      if (!detected) return false
      return this.allowed.has(detected)
    }
    const mime = await this.mimeType
    if (mime === "application/octet-stream") return false
    return this.allowed.has(mime)
  }

  public async message(): Promise<string> {
    const mime = await this.mimeType
    if (mime === "application/octet-stream") return `Unable to detect file type (got ${mime}).`
    return `File type ${mime} is not allowed. Allowed: ${[...this.allowed].join(", ")}`
  }
}
