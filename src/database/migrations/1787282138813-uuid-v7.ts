import type { MigrationInterface, QueryRunner } from "typeorm"

export class UuidV71787282138813 implements MigrationInterface {
  public name = "UuidV71787282138813"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_uuidv7"`)

    for (const table of [
      "account",
      "session",
      "user",
      "verification",
      "article",
      "article_translation",
      "article_category",
      "article_category_translation"
    ]) {
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT uuid_generate_v7()`)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`)

    for (const table of [
      "account",
      "session",
      "user",
      "verification",
      "article",
      "article_translation",
      "article_category",
      "article_category_translation"
    ]) {
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`)
    }
  }
}
