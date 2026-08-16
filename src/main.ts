import "./instrument.js"
import { fileURLToPath } from "url"
import { resolve } from "path"
import { NestFactory } from "@nestjs/core"
import { config } from "./config/index.js"
import { logger } from "./logger/index.js"
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger"
import { apiReference } from "@scalar/nestjs-api-reference"
import { AuthService } from "@thallesp/nestjs-better-auth"
import type { OpenAPIObject } from "@nestjs/swagger"
import { AppModule } from "./app.module.js"

export const app = await NestFactory.create(AppModule, {
  logger
})
app.enableShutdownHooks()
app.setGlobalPrefix("api")
app.enableCors({
  origin: config.app.origins,
  credentials: true
})

if (config.app.environment === "development") {
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Nest Boilerplate API")
    .setDescription("API documentation")
    .setVersion("1.0")
    .setContact("Muhammad Taufiqurrahman", "https://github.com/ToufiqSenpai", "taufiqurrahman.business@gmail.com")
    .addServer(config.app.baseURL)
    .build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)

  const authService = app.get(AuthService)
  const auth = authService.instance as unknown as {
    handler: (request: Request) => Promise<Response>
  }
  const schemaResponse = await auth.handler(new Request(`${config.app.baseURL}/api/auth/open-api/generate-schema`))
  const authSchema = (await schemaResponse.json()) as OpenAPIObject

  // Rename the "Default" tag from the better-auth openAPI plugin to "Auth"
  for (const [key, path] of Object.entries(authSchema.paths)) {
    for (const operation of Object.values(path)) {
      if (Array.isArray(operation.tags)) {
        operation.tags = operation.tags.map(tag => (tag === "Default" ? "Auth" : tag))
      }
    }

    authSchema.paths[`/api/auth${key}`] = path
    delete authSchema.paths[key]
  }
  for (const tag of authSchema.tags ?? []) {
    if (tag.name === "Default") tag.name = "Auth"
  }

  Object.assign(document.paths, authSchema.paths)
  document.components = {
    ...document.components,
    schemas: { ...document.components?.schemas, ...authSchema.components?.schemas },
    securitySchemes: {
      ...document.components?.securitySchemes,
      ...authSchema.components?.securitySchemes
    }
  }
  document.security = authSchema.security ?? []
  document.tags = [...(document.tags ?? []), ...(authSchema.tags ?? [])]

  SwaggerModule.setup("/api/openapi.json", app, document, {
    swaggerUiEnabled: false,
    jsonDocumentUrl: "/api/openapi.json"
  })

  app.use("/api/docs", apiReference({ url: "/api/openapi.json" }))
}

const mainPath = fileURLToPath(import.meta.url)
const entryPath = process.argv[1] ? resolve(process.argv[1]) : ""
if (entryPath === mainPath || `${entryPath}.js` === mainPath) {
  await app.listen(config.app.port)
}
else await app.init()
