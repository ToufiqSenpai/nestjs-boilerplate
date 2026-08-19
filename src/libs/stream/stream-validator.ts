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
