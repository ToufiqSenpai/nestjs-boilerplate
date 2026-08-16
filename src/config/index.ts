import "./secret.js"
import pino from "pino"
import { z } from "zod"

const environmentSchema = z
  .enum(["development", "test", "production"])
  .default("development")
  .describe("Runtime environment")

type Environment = z.infer<typeof environmentSchema>

const configSchema = z
  .object({
    app: z
      .object({
        name: z.string().min(1).max(64).default("NestJS Boilerplate").describe("Application name"),
        environment: environmentSchema,
        port: z.uint32().min(1).max(65535).default(8080).describe("Application HTTP port (1-65535)"),
        origins: z.array(z.url().max(128)).default([]).describe("Allowed CORS origin URLs"),
        baseURL: z.url().max(128).default("http://127.0.0.1:8080").describe("Application base URL")
      })
      .strict()
      .describe("Application configuration"),
    auth: z
      .object({
        secret: z.string().min(32).max(128).describe("Secret for signing auth tokens (min 32 chars)"),
        google: z
          .object({
            clientId: z.string().min(1).max(128).describe("Google OAuth client ID"),
            clientSecret: z.string().min(1).max(128).describe("Google OAuth client secret")
          })
          .strict()
          .describe("Google OAuth configuration")
      })
      .strict()
      .describe("Authentication configuration"),
    database: z
      .object({
        host: z.hostname().max(64).describe("Database hostname"),
        port: z.uint32().min(1).max(65535).describe("Database port (1-65535)").default(5432),
        username: z.string().min(1).max(64).describe("Database username"),
        password: z.string().min(1).max(128).describe("Database password"),
        name: z.string().min(1).max(64).describe("Database name")
      })
      .strict()
      .describe("Database configuration"),
    email: z
      .object({
        from: z.email().max(128).describe("Default sender email address").default("Acme <onboarding@resend.dev>"),
        replyTo: z.email().max(128).describe("Default reply-to email address").default("support@example.com"),
        resendAPIKey: z.string().min(1).max(192).startsWith("re_").describe("Resend API key (must start with re_)")
      })
      .strict()
      .describe("Email configuration"),
    log: z
      .object({
        level: z.enum(Object.keys(pino.levels.values)).default("info").describe("Log level")
      })
      .strict()
      .describe("Logger configuration"),
    s3: z
      .object({
        accessKeyId: z.string().min(1).max(128).describe("S3 access key ID"),
        secretAccessKey: z.string().min(1).max(128).describe("S3 secret access key"),
        bucket: z.string().min(1).max(63).optional().describe("S3 bucket name"),
        endpoint: z.url().max(256).describe("S3 endpoint URL"),
        region: z.string().min(1).max(32).default("auto").describe("S3 region")
      })
      .strict()
      .describe("S3 storage configuration"),
    sentry: z
      .object({
        dsn: z.url().max(256).describe("Sentry DSN")
      })
      .strict()
      .describe("Sentry configuration")
  })
  .strict()
  .describe("Root application configuration")

export const config = configSchema.parse({
  app: {
    environment: process.env.NODE_ENV,
    port: defaultEnvironment({ production: 80 })
  },
  auth: {
    secret: process.env.BETTER_AUTH_SECRET,
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    }
  },
  database: {
    host: process.env.DATABASE_HOST,
    port: process.env.DATABASE_PORT,
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    name: process.env.DATABASE_NAME
  },
  email: {
    resendAPIKey: process.env.RESEND_API_KEY
  },
  log: {
    level: defaultEnvironment({
      development: "debug",
      test: "trace",
      production: "info"
    })
  },
  s3: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    bucket: process.env.S3_BUCKET,
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION
  },
  sentry: {
    dsn: process.env.SENTRY_DSN
  }
})

function defaultEnvironment<T = unknown>(values: Partial<Record<Environment, T>>): T {
  const parsed = environmentSchema.safeParse(process.env.NODE_ENV)
  const env = parsed.success ? parsed.data : "development"

  return values[env]
}
