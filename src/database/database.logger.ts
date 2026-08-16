import type { Logger as TypeOrmLogger, QueryRunner } from "typeorm"
import { Logger } from "@nestjs/common"

export class DatabaseLogger implements TypeOrmLogger {
  private readonly logger = new Logger(DatabaseLogger.name)

  public logQuery(
    query: string,
    _parameters?: unknown[] | Record<string, unknown>,
    _queryRunner?: QueryRunner
  ): void {
    this.logger.debug({ query }, "Query executed")
  }

  public logQueryError(
    error: string | Error,
    query: string,
    _parameters?: unknown[] | Record<string, unknown>,
    _queryRunner?: QueryRunner
  ): void {
    this.logger.error(
      { query, error: error instanceof Error ? error.message : error },
      "Query failed"
    )
  }

  public logQuerySlow(
    time: number,
    query: string,
    _parameters?: unknown[] | Record<string, unknown>,
    _queryRunner?: QueryRunner
  ): void {
    this.logger.warn({ query, durationMs: time }, "Slow query detected")
  }

  public logSchemaBuild(message: string, _queryRunner?: QueryRunner): void {
    this.logger.debug({ message }, "Schema build")
  }

  public logMigration(message: string, _queryRunner?: QueryRunner): void {
    this.logger.log({ message }, "Migration")
  }

  public log(level: "log" | "info" | "warn", message: unknown, _queryRunner?: QueryRunner): void {
    switch (level) {
      case "log":
      case "info":
        this.logger.log({ message }, "TypeORM")
        break
      case "warn":
        this.logger.warn({ message }, "TypeORM")
        break
    }
  }
}
