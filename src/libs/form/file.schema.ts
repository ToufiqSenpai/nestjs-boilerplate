import { z, GlobalMeta } from "zod"

interface FileSchemaOptions {
  mimetype?: string[]
  maxSize: number
  collection: string
}

export function createFileSchema({ mimetype, maxSize, collection }: FileSchemaOptions) {
  const mimetypeSchema = mimetype && mimetype.length > 0 ? z.enum(mimetype as [string, ...string[]]) : z.string()

  return z
    .object({
      name: z.string().describe("S3 object key"),
      originalName: z.string().describe("Original filename from client"),
      size: z.number().max(maxSize).describe("File size in bytes"),
      mimetype: mimetypeSchema.describe("File MIME type")
    })
    .meta({ collection } as FileSchemaMeta)
}

export type FormFile = z.output<ReturnType<typeof createFileSchema>>

export interface FileSchemaMeta extends GlobalMeta {
  collection: string
}
