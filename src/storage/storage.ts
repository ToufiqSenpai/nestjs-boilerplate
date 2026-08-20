import { Injectable } from "@nestjs/common"
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client
} from "@aws-sdk/client-s3"
import { Upload } from "@aws-sdk/lib-storage"
import type { Readable } from "stream"
import { config } from "../config/index.js"
import { StorageKey } from "./storage-key.js"

export interface FileHeaders {
  cacheControl?: string
  contentDisposition?: string
  contentEncoding?: string
  contentLanguage?: string
  contentType?: string
  contentLength?: number
  metadata?: Record<string, string>
}

export interface UploadFileParams {
  key: StorageKey
  stream: Readable
  headers?: FileHeaders
  signal?: AbortSignal
}

export interface CopyFileParams {
  source: StorageKey
  destination: StorageKey
  headers?: FileHeaders
}

export interface FileMetadata {
  key: string
  contentType?: string
  contentEncoding?: string
  contentLanguage?: string
  contentDisposition?: string
  createdAt?: Date
  lastModifiedAt?: Date
  size?: number
  metadata?: Record<string, string>
}

@Injectable()
export class Storage {
  public constructor(private readonly s3: S3Client) {}

  public async upload({ key, stream, headers, signal }: UploadFileParams): Promise<FileMetadata> {
    const s3Key = key.toString()
    let bytesSent = 0
    stream.on("data", chunk => {
      bytesSent += chunk.length
    })

    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: config.s3.bucket,
        Key: s3Key,
        Body: stream,
        CacheControl: headers?.cacheControl,
        ContentDisposition: headers?.contentDisposition,
        ContentEncoding: headers?.contentEncoding,
        ContentLanguage: headers?.contentLanguage,
        ContentType: headers?.contentType,
        ContentLength: headers?.contentLength,
        Metadata: headers?.metadata
      },
      leavePartsOnError: false
    })

    if (signal) {
      if (signal.aborted) await upload.abort()
      else signal.addEventListener("abort", () => void upload.abort(), { once: true })
    }

    await upload.done()
    return {
      key: s3Key,
      contentType: headers?.contentType,
      contentEncoding: headers?.contentEncoding,
      contentLanguage: headers?.contentLanguage,
      contentDisposition: headers?.contentDisposition,
      size: bytesSent,
      metadata: headers?.metadata,
      createdAt: new Date(),
      lastModifiedAt: new Date()
    }
  }

  public async getFile(key: StorageKey): Promise<Readable> {
    const result = await this.s3.send(
      new GetObjectCommand({
        Bucket: config.s3.bucket,
        Key: key.toString()
      })
    )
    return result.Body as Readable
  }

  public async getFileMetadata(key: StorageKey): Promise<FileMetadata> {
    const s3Key = key.toString()
    const head = await this.s3.send(
      new HeadObjectCommand({
        Bucket: config.s3.bucket,
        Key: s3Key
      })
    )

    return {
      key: s3Key,
      contentType: head.ContentType,
      contentEncoding: head.ContentEncoding,
      contentLanguage: head.ContentLanguage,
      contentDisposition: head.ContentDisposition,
      createdAt: undefined,
      lastModifiedAt: head.LastModified,
      size: head.ContentLength,
      metadata: head.Metadata
    }
  }

  public async copy({ source, destination, headers }: CopyFileParams): Promise<FileMetadata> {
    const sourceKey = source.toString()
    const destinationKey = destination.toString()

    await this.s3.send(
      new CopyObjectCommand({
        Bucket: config.s3.bucket,
        CopySource: `${config.s3.bucket}/${sourceKey}`,
        Key: destinationKey,
        CacheControl: headers?.cacheControl,
        ContentDisposition: headers?.contentDisposition,
        ContentEncoding: headers?.contentEncoding,
        ContentLanguage: headers?.contentLanguage,
        ContentType: headers?.contentType,
        Metadata: headers?.metadata,
        MetadataDirective: headers ? "REPLACE" : undefined
      })
    )

    const head = await this.s3.send(
      new HeadObjectCommand({
        Bucket: config.s3.bucket,
        Key: destinationKey
      })
    )

    return {
      key: destinationKey,
      contentType: headers?.contentType ?? head.ContentType,
      contentEncoding: headers?.contentEncoding ?? head.ContentEncoding,
      contentLanguage: headers?.contentLanguage ?? head.ContentLanguage,
      contentDisposition: headers?.contentDisposition ?? head.ContentDisposition,
      createdAt: undefined,
      lastModifiedAt: head.LastModified,
      size: head.ContentLength,
      metadata: headers?.metadata ?? head.Metadata
    }
  }

  public async list(collection: string): Promise<FileMetadata[]> {
    // Important for path sanitazion
    const prefix = `${new StorageKey(collection, "__probe__").collection}/`
    const objects: FileMetadata[] = []
    let continuationToken: string | undefined

    do {
      const page = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: config.s3.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken
        })
      )

      for (const obj of page.Contents ?? []) {
        if (!obj.Key) continue
        const head = await this.s3.send(
          new HeadObjectCommand({
            Bucket: config.s3.bucket,
            Key: obj.Key
          })
        )
        objects.push({
          key: obj.Key,
          contentType: head.ContentType,
          contentEncoding: head.ContentEncoding,
          contentLanguage: head.ContentLanguage,
          contentDisposition: head.ContentDisposition,
          createdAt: undefined,
          lastModifiedAt: head.LastModified,
          size: head.ContentLength,
          metadata: head.Metadata
        })
      }

      continuationToken = page.NextContinuationToken
    } while (continuationToken)

    return objects
  }

  public async delete(key: StorageKey): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: config.s3.bucket,
        Key: key.toString()
      })
    )
  }
}
