import { z, ZodError } from "zod"

export class StorageKey {
  private readonly sanitize = (s: string): string => s.replace(/[/\\\u0000-\u001f]/g, "")
  private readonly segmentSchema = z
    .string()
    .min(1, { error: "Collection/name must be non-empty" })
    .transform(this.sanitize)
    .refine(v => v.length > 0, { error: "Collection/name becomes empty after sanitization" })
  private readonly keyStringSchema = z
    .string()
    .min(1)
    .regex(/^[^/]+\/[^/]+$/, { error: 'Key must be "collection/name"' })
    .refine(v => v.indexOf("/") === v.lastIndexOf("/"), { error: 'Key exactly one "/"' })

  public readonly collection: string
  public readonly name: string

  public constructor(collection: string, name: string)
  public constructor(key: string)
  public constructor(arg1: string, arg2?: string) {
    if (arg2 === undefined) {
      const parsed = this.parseOrThrow(this.keyStringSchema, arg1)
      const i = parsed.indexOf("/")
      this.collection = this.parseOrThrow(this.segmentSchema, parsed.slice(0, i))
      this.name = this.parseOrThrow(this.segmentSchema, parsed.slice(i + 1))
    } else {
      this.collection = this.parseOrThrow(this.segmentSchema, arg1)
      this.name = this.parseOrThrow(this.segmentSchema, arg2)
    }
  }

  public toString(): string {
    return `${this.collection}/${this.name}`
  }

  public equals(other: StorageKey): boolean {
    return this.collection === other.collection && this.name === other.name
  }

  private parseOrThrow<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
    try {
      return schema.parse(value)
    } catch (e) {
      if (e instanceof ZodError) throw new Error(e.issues[0]?.message ?? "Invalid StorageKey")
      throw e
    }
  }
}
