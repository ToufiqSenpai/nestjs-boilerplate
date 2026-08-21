import { Entity, OneToMany } from "typeorm"
import { BaseEntity } from "../../../database/base.entity.js"
import { ArticleCategoryTranslation } from "./article-category-translation.entity.js"

@Entity({ name: "article_category" })
export class ArticleCategory extends BaseEntity {
  @OneToMany(() => ArticleCategoryTranslation, translation => translation.category)
  public translations: Promise<ArticleCategoryTranslation[]>
}
