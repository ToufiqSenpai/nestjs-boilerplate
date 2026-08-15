import { Global, Module } from "@nestjs/common"
import { TypeOrmModule, TypeOrmModuleOptions } from "@nestjs/typeorm"
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
import { config } from "../config/index.js"

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory() {
        let options: TypeOrmModuleOptions = {
          type: "postgres",
          synchronize: config.app.environment !== "production",
          entities: [User, Session, Account, Verification, Article, ArticleTranslation],
          // migrations: [
          //   process.env.NODE_ENV === "production"
          //     ? "dist/database/migrations/*.js"
          //     : "src/database/migrations/*.ts"
          // ],
          // migrationsTableName: "migrations",
          // migrationsRun: process.env.NODE_ENV !== "test"
        }

        if (config.app.environment === "test") {
          options = {
            ...options,
            driver: { Pool: PGlitePool },
            uuidExtension: "pgcrypto"
          }
        } else {
          options = {
            ...options,
            host: config.database.host,
            port: config.database.port,
            username: config.database.username,
            password: config.database.password,
            database: config.database.name,
            ssl: true
          } as PostgresDataSourceOptions
        }

        return options
      }
    })
  ],
  providers: [TransactionContextService, UnitOfWork],
  exports: [TransactionContextService, UnitOfWork]
})
@Global()
export class DatabaseModule {}
