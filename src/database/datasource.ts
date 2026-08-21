import "reflect-metadata"
import { DataSource, type DataSourceOptions } from "typeorm"
import { config } from "../config/index.js"
import { User } from "../modules/auth/entities/user.entity.js"
import { Session } from "../modules/auth/entities/session.entity.js"
import { Account } from "../modules/auth/entities/account.entity.js"
import { Verification } from "../modules/auth/entities/verification.entity.js"
import { Article } from "../modules/articles/entities/article.entity.js"
import { ArticleCategory } from "../modules/articles/entities/article-category.entity.js"
import { ArticleCategoryTranslation } from "../modules/articles/entities/article-category-translation.entity.js"
import { ArticleTranslation } from "../modules/articles/entities/article-translation.entity.js"
import { PGlitePool } from "./pglite.js"
import { DatabaseLogger } from "./database.logger.js"

const migrationExtension = import.meta.dirname.includes("\\dist\\") || import.meta.dirname.includes("/dist/") ? "js" : "ts"

let options: DataSourceOptions = {
  type: "postgres" as const,
  entities: [
    User,
    Session,
    Account,
    Verification,
    Article,
    ArticleCategory,
    ArticleCategoryTranslation,
    ArticleTranslation
  ],
  migrations: [import.meta.dirname + `/migrations/*.${migrationExtension}`],
  migrationsRun: true,
  migrationsTableName: "migrations",
  migrationsTransactionMode: "all",
  installExtensions: false,
  logger: new DatabaseLogger(),
  logging: ["query", "error", "warn", "schema", "migration"]
}

if (config.app.environment === "test") {
  options = {
    ...options,
    driver: { Pool: PGlitePool }
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
  }
}

export default new DataSource(options)
