import { Column, Entity, JoinColumn, ManyToOne, Unique } from "typeorm"
import { BaseEntity } from "../../../database/base.entity.js"
import { DEFAULT_LOCALE } from "../../../i18n/index.js"
import type { Locale } from "../../../i18n/index.js"
import { ArticleCategory } from "./article-category.entity.js"

@Entity({ name: "article_category_translation" })
@Unique(["categoryId", "locale"])
@Unique(["locale", "slug"])
export class ArticleCategoryTranslation extends BaseEntity {
  @Column({ type: "text", default: DEFAULT_LOCALE.locale })
  public locale: Locale

  @Column({ type: "uuid" })
  public categoryId: string

  @ManyToOne(() => ArticleCategory, { onDelete: "CASCADE" })
  @JoinColumn({ name: "categoryId" })
  public category: Promise<ArticleCategory>

  @Column({ type: "text" })
  public name: string

  @Column({ type: "text" })
  public slug: string

  @Column({ type: "text", nullable: true })
  public description: string | null
}
