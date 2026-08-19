import {
  BadRequestException,
  MiddlewareConsumer,
  Module,
  NestModule,
  StandardSchemaValidationPipe
} from "@nestjs/common"
import { APP_FILTER, APP_PIPE } from "@nestjs/core"
import { SentryModule } from "@sentry/nestjs/setup"
import { DatabaseModule } from "./database/database.module.js"
import { AuthModule } from "./modules/auth/auth.module.js"
import { EmailModule } from "./email/email.module.js"
import { SentryContextMiddleware } from "./common/middlewares/sentry-context.middleware.js"
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter.js"
import { StorageModule } from "./storage/storage.module.js"
import { HealthModule } from "./modules/health/health.module.js"
import { ArticleModule } from "./modules/articles/article.module.js"

@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    EmailModule,
    SentryModule.forRoot(),
    StorageModule,
    HealthModule,
    ArticleModule
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter
    },
    {
      provide: APP_PIPE,
      useValue: new StandardSchemaValidationPipe({
        exceptionFactory(issues) {
          return new BadRequestException({
            message: "Validation failed",
            errors: issues.map(issue => ({
              path: issue.path,
              message: issue.message
            }))
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
