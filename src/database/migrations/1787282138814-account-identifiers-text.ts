import type { MigrationInterface, QueryRunner } from "typeorm"

export class AccountIdentifiersText1787282138814 implements MigrationInterface {
  public name = "AccountIdentifiersText1787282138814"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "account" ALTER COLUMN "accountId" TYPE text USING "accountId"::text`)
    await queryRunner.query(`ALTER TABLE "account" ALTER COLUMN "providerId" TYPE text USING "providerId"::text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "account" ALTER COLUMN "providerId" TYPE uuid USING "providerId"::uuid`)
    await queryRunner.query(`ALTER TABLE "account" ALTER COLUMN "accountId" TYPE uuid USING "accountId"::uuid`)
  }
}
