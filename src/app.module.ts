import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common"
import { APP_FILTER } from "@nestjs/core"
import { LoggerModule } from "nestjs-pino"
import { SentryModule } from "@sentry/nestjs/setup"
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
    }
  ]
})
export class AppModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SentryContextMiddleware).forRoutes("*")
  }
}
