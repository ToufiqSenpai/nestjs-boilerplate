import { MigrationInterface, QueryRunner } from "typeorm"

export class Init1786596409345 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        "name" text NOT NULL,
        "email" text NOT NULL,
        "emailVerified" boolean NOT NULL DEFAULT false,
        "image" text,
        "role" text,
        "banned" boolean NOT NULL DEFAULT false,
        "banReason" text,
        "banExpires" timestamp,
        CONSTRAINT "PK_user" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_email" UNIQUE ("email")
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "session" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        "userId" text NOT NULL,
        "token" text NOT NULL,
        "expiresAt" timestamp NOT NULL,
        "ipAddress" text,
        "userAgent" text,
        "impersonatedBy" text,
        CONSTRAINT "PK_session" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_session_token" UNIQUE ("token")
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "account" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        "userId" text NOT NULL,
        "accountId" text NOT NULL,
        "providerId" text NOT NULL,
        "accessToken" text,
        "refreshToken" text,
        "accessTokenExpiresAt" timestamp,
        "refreshTokenExpiresAt" timestamp,
        "scope" text,
        "idToken" text,
        "password" text,
        CONSTRAINT "PK_account" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "verification" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        "identifier" text NOT NULL,
        "value" text NOT NULL,
        "expiresAt" timestamp NOT NULL,
        CONSTRAINT "PK_verification" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE INDEX "IDX_session_userId" ON "session" ("userId")
    `)
    await queryRunner.query(`
      CREATE INDEX "IDX_account_userId" ON "account" ("userId")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "verification"`)
    await queryRunner.query(`DROP TABLE "account"`)
    await queryRunner.query(`DROP TABLE "session"`)
    await queryRunner.query(`DROP TABLE "user"`)
  }
}
