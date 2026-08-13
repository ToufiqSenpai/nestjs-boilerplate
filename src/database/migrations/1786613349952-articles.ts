import { MigrationInterface, QueryRunner } from "typeorm";

export class Articles1786613349952 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "article_status_enum" AS ENUM ('draft', 'published', 'archived')
    `)

    await queryRunner.query(`
      CREATE TABLE "article" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        "status" "article_status_enum" NOT NULL DEFAULT 'draft',
        "publishedAt" timestamp,
        "authorId" uuid,
        CONSTRAINT "PK_article" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "article_translation" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        "locale" text NOT NULL DEFAULT 'en',
        "articleId" uuid NOT NULL,
        "title" character varying NOT NULL,
        "slug" character varying NOT NULL,
        "excerpt" text NOT NULL,
        "content" jsonb NOT NULL,
        "metaTitle" character varying NOT NULL,
        "metaDescription" character varying NOT NULL,
        CONSTRAINT "PK_article_translation" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_article_translation_articleId_locale" UNIQUE ("articleId", "locale"),
        CONSTRAINT "UQ_article_translation_locale_slug" UNIQUE ("locale", "slug")
      )
    `)

    await queryRunner.query(`
      ALTER TABLE "article" ADD CONSTRAINT "FK_article_author" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL
    `)
    await queryRunner.query(`
      ALTER TABLE "article_translation" ADD CONSTRAINT "FK_article_translation_article" FOREIGN KEY ("articleId") REFERENCES "article"("id") ON DELETE CASCADE
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "article_translation"`)
    await queryRunner.query(`DROP TABLE "article"`)
    await queryRunner.query(`DROP TYPE "article_status_enum"`)
  }
}
