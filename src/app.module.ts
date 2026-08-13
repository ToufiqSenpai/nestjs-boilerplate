import { MiddlewareConsumer, Module, NestModule, BadRequestException, ValidationPipe } from "@nestjs/common"
import { APP_FILTER, APP_PIPE } from "@nestjs/core"
import { LoggerModule } from "nestjs-pino"
import { SentryModule } from "@sentry/nestjs/setup"
import { ConfigModule } from "./config/config.module.js"
import { DatabaseModule } from "./database/database.module.js"
import { AuthModule } from "./modules/auth/auth.module.js"
import { EmailModule } from "./email/email.module.js"
import { SentryContextMiddleware } from "./common/middlewares/sentry-context.middleware.js"
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter.js"
import { StorageModule } from "./storage/storage.module.js"
import { HealthModule } from "./modules/health/health.module.js"
import { ValidationModule } from "./validation/validation.module.js"

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    DatabaseModule,
    EmailModule,
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: false,
        transport: {
          target: "pino-pretty",
          options: {
            singleLine: true,
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname"
          }
        }
      }
    }),
    SentryModule.forRoot(),
    StorageModule,
    HealthModule,
    ValidationModule
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter
    },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        transform: true,
        whitelist: true,
        exceptionFactory(errors): BadRequestException {
          const formattedErrors: Record<string, string[]> = {}

          for (const err of errors) {
            if (err.constraints) {
              formattedErrors[err.property] = Object.values(err.constraints)
            }

            if (err.children && err.children.length > 0) {
              for (const child of err.children) {
                if (child.constraints) {
                  formattedErrors[`${err.property}.${child.property}`] = Object.values(child.constraints)
                }
              }
            }
          }

          return new BadRequestException({
            message: "Validation Failed",
            errors: formattedErrors
          })
        }
      })
    }
  ]
})
export class AppModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SentryContextMiddleware).forRoutes("*")
  }
}
