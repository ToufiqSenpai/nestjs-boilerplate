import "reflect-metadata"
import { DataSource, type DataSourceOptions } from "typeorm"
import type { PostgresDataSourceOptions } from "typeorm/driver/postgres/PostgresDataSourceOptions.js"
import { config } from "../config/index.js"
import { User } from "../modules/auth/entities/user.entity.js"
import { Session } from "../modules/auth/entities/session.entity.js"
import { Account } from "../modules/auth/entities/account.entity.js"
import { Verification } from "../modules/auth/entities/verification.entity.js"
import { Article } from "../modules/articles/entities/article.entity.js"
import { ArticleTranslation } from "../modules/articles/entities/article-translation.entity.js"
import { PGlitePool } from "./pglite.js"
import { DatabaseLogger } from "./database.logger.js"

let options: DataSourceOptions = {
  type: "postgres" as const,
  entities: [User, Session, Account, Verification, Article, ArticleTranslation],
  migrations: [import.meta.dirname + "/migrations/**/*{.js,.ts}"],
  migrationsRun: true,
  migrationsTableName: "migrations",
  migrationsTransactionMode: "all",
  logger: new DatabaseLogger(),
  logging: ["query", "error", "warn", "schema", "migration"]
}

if (config.app.environment === "test") {
  options = {
    ...options,
    driver: { Pool: PGlitePool },
    uuidExtension: "pgcrypto"
  } as PostgresDataSourceOptions
} else {
  options = {
    ...options,
    host: config.database.host,
    port: config.database.port,
    username: config.database.username,
    password: config.database.password,
    database: config.database.name,
    ssl: true
  }
}

export default new DataSource(options)
