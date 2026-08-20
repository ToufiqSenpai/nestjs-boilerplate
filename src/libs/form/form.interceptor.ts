import { Busboy } from "@fastify/busboy"
import { randomUUID } from "crypto"
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  ParameterDecoratorOptions,
  PayloadTooLargeException,
  UnsupportedMediaTypeException
} from "@nestjs/common"
import { StreamValidation } from "../stream/stream-validation.js"
import { FileTypeValidator, SizeLimitingValidator } from "../stream/stream-validator.js"
import type { StreamValidator } from "../stream/stream-validator.js"
import { StreamValidationException } from "../stream/stream-validation.exception.js"
import { RouteParamtypes, ROUTE_ARGS_METADATA } from "@nestjs/common/internal"
import type { Observable } from "rxjs"
import { catchError, from, mergeMap, throwError } from "rxjs"
import { Storage } from "../../storage/storage.js"
import { StorageKey } from "../../storage/storage-key.js"
import type { FileSchemaMeta, FormFile } from "./file.schema.js"
import type { Request } from "express"
import { ZodArray, ZodEnum, ZodNumber, ZodObject, ZodType } from "zod"

type ParsedForm = Partial<Record<string, string | string[] | FormFile | FormFile[]>>

@Injectable()
export class FormInterceptor implements NestInterceptor {
  private readonly logger = new Logger(FormInterceptor.name)

  public constructor(private readonly storage: Storage) {}

  public async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<Request>()

    const routeArgs = Reflect.getMetadata(ROUTE_ARGS_METADATA, context.getClass(), context.getHandler().name) as Record<
      string,
      ParameterDecoratorOptions
    >
    let bodyMeta: ParameterDecoratorOptions | null = null

    for (const key in routeArgs) {
      if (key.startsWith(RouteParamtypes.BODY.toString())) {
        bodyMeta = routeArgs[key]
      }
    }

    if (!bodyMeta?.schema) {
      throw new Error("Missing form schema. Add @Body({ schema }) to the handler")
    }

    const schema = bodyMeta.schema as ZodObject
    req.body = await this.parseMultipart(req, schema)

    return next
      .handle()
      .pipe(catchError(error => from(this.rollback(req.body)).pipe(mergeMap(() => throwError(() => error)))))
  }

  private parseMultipart(req: Request, schema: ZodObject): Promise<ParsedForm> {
    return new Promise((resolve, reject) => {
      const bb = Busboy({
        headers: { ...req.headers, "content-type": req.headers["content-type"] ?? "application/octet-stream" }
      })

      const parsed: ParsedForm = {}
      const uploads: Promise<void>[] = []

      bb.on("field", (fieldname, value) => {
        this.appendParsedForm(parsed, fieldname, value)
      })

      bb.on("file", async (fieldname, stream, filename, _encoding, mimeType) => {
        this.logger.verbose(`Mimetype: ${mimeType}`)

        try {
          const fileField = this.resolveFileField(schema, fieldname)
          if (!fileField) {
            stream.resume()
            return
          }
          const { collection, maxSize, mime } = fileField

          const name = `${randomUUID()}-${filename}`
          const validators: StreamValidator<Buffer>[] = []
          if (maxSize !== undefined && maxSize != 0) validators.push(new SizeLimitingValidator(maxSize))
          let fileTypeValidator: FileTypeValidator | undefined
          if (mime?.length) {
            fileTypeValidator = new FileTypeValidator(mime)
            validators.push(fileTypeValidator)
          }
          const validationStream = new StreamValidation<Buffer>(...validators).stream
          const abort = new AbortController()
          let rejected = false

          const fail = (err: Error): void => {
            if (rejected) return
            rejected = true
            stream.unpipe(validationStream)
            stream.resume()
            validationStream.destroy()
            abort.abort()
            if (err instanceof StreamValidationException && err.validator instanceof SizeLimitingValidator) {
              reject(
                new PayloadTooLargeException({ message: `${fieldname} exceeds ${maxSize} bytes — limit ${maxSize}` })
              )
            } else if (err instanceof StreamValidationException && err.validator instanceof FileTypeValidator) {
              void err.validator.message().then(message => {
                reject(new UnsupportedMediaTypeException({ message }))
              })
            } else {
              reject(err)
            }
          }

          validationStream.on("error", fail)
          stream.on("error", err => {
            validationStream.destroy(err)
            fail(err)
          })
          stream.pipe(validationStream)

          const upload = this.storage
            .upload({
              key: new StorageKey(collection, name),
              stream: validationStream,
              headers: { contentType: mimeType },
              signal: abort.signal
            })
            .then(async result => {
              this.logger.verbose(`Is rejected: ${rejected}`)

              if (rejected) return

              const finalMime = fileTypeValidator ? await fileTypeValidator.mimeType : mimeType

              if (fileTypeValidator && finalMime !== mimeType) {
                await this.storage.copy({
                  source: new StorageKey(result.key),
                  destination: new StorageKey(result.key),
                  headers: { contentType: finalMime }
                })
              }

              const file: FormFile = {
                name: result.key,
                originalName: filename,
                size: result.size ?? 0,
                mimetype: finalMime
              }

              this.logger.verbose(file)
              this.appendParsedForm(parsed, fieldname, file)
            })
            .catch(err => {
              if (!rejected) throw err
            })

          uploads.push(upload)
        } catch (error) {
          reject(error)
        }
      })

      bb.on("finish", async () => {
        try {
          await Promise.all(uploads)
          for (const [key, value] of Object.entries(parsed)) {
            if (Array.isArray(value) && value.length === 1) {
              const fieldSchema = schema.shape[key] as ZodType | undefined
              const isArrayField = fieldSchema ? fieldSchema.def.type === "array" : false
              if (!isArrayField) parsed[key] = value[0]
            }
          }
          resolve(parsed)
        } catch (err) {
          reject(err)
        }
      })

      bb.on("error", reject)

      req.on("close", () => {
        if (!bb.writableFinished) {
          reject(new Error("Request aborted by client"))
          bb.destroy()
        }
      })

      req.on("error", err => {
        reject(err)
        bb.destroy()
      })

      req.pipe(bb)
    })
  }

  private async rollback(parsed: ParsedForm): Promise<void> {
    const keys: string[] = []
    for (const value of Object.values(parsed)) {
      if (Array.isArray(value)) {
        for (const item of value) if (typeof item === "object" && "name" in item) keys.push(item.name)
      } else if (typeof value === "object" && "name" in value) {
        keys.push(value.name)
      }
    }
    await Promise.allSettled(keys.map(key => this.storage.delete(new StorageKey(key))))
  }

  private appendParsedForm(parsed: ParsedForm, fieldname: string, value: string | FormFile): void {
    const existing = parsed[fieldname]
    if (Array.isArray(existing)) {
      ;(existing as (string | FormFile)[]).push(value)
    } else if (existing !== undefined) {
      parsed[fieldname] = [existing, value] as ParsedForm[string]
    } else {
      parsed[fieldname] = value
    }
  }

  private resolveFileField(
    schema: ZodObject,
    fieldname: string
  ): { collection: string; maxSize?: number; mime?: string[] } | null {
    const raw = schema.shape[fieldname] as ZodType | undefined
    if (!raw) return null

    const t = raw.def.type
    let element: ZodObject | null = null

    if (t === "array") {
      element = (raw as ZodArray).unwrap() as ZodObject
    } else if (t === "object") {
      element = raw as ZodObject
    } else {
      throw new InvalidSchemaException(`Schema element ${fieldname} must followed createFileSchema`)
    }

    const collection = (element.meta() as FileSchemaMeta).collection
    if (!collection)
      throw new InvalidSchemaException("Schema collection must contain `collection` key for storage collection")

    const sizeSchema = element.shape.size as ZodType | undefined
    if (sizeSchema && sizeSchema.def.type !== "number")
      throw new InvalidSchemaException("File schema must contain `size` with type ZodNumber")

    const mimeSchema = element.shape.mimetype as ZodType | undefined
    this.logger.verbose(`Mime schema type: ${mimeSchema?.def.type}`)
    let mime: string[] | undefined = undefined
    if (mimeSchema && mimeSchema.def.type == "enum") mime = Object.keys((mimeSchema as ZodEnum).enum)
    else if (mimeSchema && mimeSchema.def.type == "string") {
    } else throw new InvalidSchemaException("File schema must contain `mimetype` with type ZodString or ZodEnum")

    return { collection, maxSize: (sizeSchema as ZodNumber).maxValue ?? 0, mime }
  }
}

class InvalidSchemaException extends Error {}
