import type { MigrationInterface, QueryRunner } from "typeorm";

export class ArticleCategory1787282138812 implements MigrationInterface {
    public name = 'ArticleCategory1787282138812'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_uuidv7"`);
        await queryRunner.query(`CREATE TABLE "article_category_translation" ("id" uuid NOT NULL DEFAULT uuid_generate_v7(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "locale" text NOT NULL DEFAULT 'en', "categoryId" uuid NOT NULL, "name" text NOT NULL, "slug" text NOT NULL, "description" text, CONSTRAINT "UQ_39ae909a617fa13ceb50aeae502" UNIQUE ("locale", "slug"), CONSTRAINT "UQ_0856d7313272174b97b5c87137b" UNIQUE ("categoryId", "locale"), CONSTRAINT "PK_b3c473e3d757f4509639808832d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "article_category" ("id" uuid NOT NULL DEFAULT uuid_generate_v7(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cdd234ef147c8552a8abd42bd29" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "article" ADD "categoryId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "article_category_translation" ADD CONSTRAINT "FK_ae2dedf17123255355dc1492c46" FOREIGN KEY ("categoryId") REFERENCES "article_category"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "article" ADD CONSTRAINT "FK_12824e4598ee46a0992d99ba553" FOREIGN KEY ("categoryId") REFERENCES "article_category"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "article" DROP CONSTRAINT "FK_12824e4598ee46a0992d99ba553"`);
        await queryRunner.query(`ALTER TABLE "article_category_translation" DROP CONSTRAINT "FK_ae2dedf17123255355dc1492c46"`);
        await queryRunner.query(`ALTER TABLE "article" DROP COLUMN "categoryId"`);
        await queryRunner.query(`DROP TABLE "article_category"`);
        await queryRunner.query(`DROP TABLE "article_category_translation"`);
    }

}
