import { Column, Entity, JoinColumn, ManyToOne, Unique } from "typeorm";
import { BaseEntity } from "../../../database/base.entity.js";
import { DEFAULT_LOCALE } from "../../../i18n/index.js";
import type { Locale } from "../../../i18n/index.js";
import { Article } from "./article.entity.js";

@Entity({ name: "article_translation" })
@Unique(["articleId", "locale"])
@Unique(["locale", "slug"])
export class ArticleTranslation extends BaseEntity {
  @Column({ type: "text", default: DEFAULT_LOCALE })
  public locale: Locale

  @Column({ type: "uuid" })
  public articleId: string

  @ManyToOne(() => Article, { onDelete: "CASCADE" })
  @JoinColumn({ name: "articleId" })
  public article: Promise<Article>

  @Column()
  public title: string

  @Column()
  public slug: string

  @Column({ type: "text" })
  public excerpt: string

  @Column({ type: "jsonb" })
  public content: Record<string, unknown>

  @Column()
  public metaTitle: string

  @Column()
  public metaDescription: string
}
