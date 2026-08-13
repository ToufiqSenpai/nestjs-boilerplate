import { Global, Module } from "@nestjs/common"
import { TypeOrmModule, TypeOrmModuleOptions } from "@nestjs/typeorm"
import { ConfigService } from "@nestjs/config"
import { User } from "../modules/auth/entities/user.entity.js"
import { Session } from "../modules/auth/entities/session.entity.js"
import { Account } from "../modules/auth/entities/account.entity.js"
import { Verification } from "../modules/auth/entities/verification.entity.js"
import { Article } from "../modules/articles/entities/article.entity.js"
import { ArticleTranslation } from "../modules/articles/entities/article-translation.entity.js"
import { PGlitePool } from "./pglite-pool.js"
import { TransactionContextService } from "./unit-of-work/transaction-context.service.js"
import { UnitOfWork } from "./unit-of-work/unit-of-work.js"
import { PostgresDataSourceOptions } from "typeorm/driver/postgres/PostgresDataSourceOptions.js"

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory(config: ConfigService) {
        let options: TypeOrmModuleOptions = {
          type: "postgres",
          synchronize: process.env.NODE_ENV !== "production",
          entities: [User, Session, Account, Verification, Article, ArticleTranslation],
          migrations: [
            process.env.NODE_ENV === "production"
              ? "dist/database/migrations/*.js"
              : "src/database/migrations/*.ts"
          ],
          migrationsTableName: "migrations",
          migrationsRun: process.env.NODE_ENV !== "test"
        }

        if (process.env.NODE_ENV === "test") {
          options = {
            ...options,
            driver: { Pool: PGlitePool },
            uuidExtension: "pgcrypto"
          }
        } else {
          options = {
            ...options,
            host: config.getOrThrow("DATABASE_HOST"),
            port: config.get("DATABASE_PORT", 5432),
            username: config.getOrThrow("DATABASE_USERNAME"),
            password: config.getOrThrow("DATABASE_PASSWORD"),
            database: config.getOrThrow("DATABASE_NAME"),
            ssl: true
          } as PostgresDataSourceOptions
        }

        return options
      },
      inject: [ConfigService]
    })
  ],
  providers: [TransactionContextService, UnitOfWork],
  exports: [TransactionContextService, UnitOfWork]
})
@Global()
export class DatabaseModule {}
