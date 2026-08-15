import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from "typeorm";
import { BaseEntity } from "../../../database/base.entity.js";
import { User } from "../../auth/entities/user.entity.js";
import { ArticleTranslation } from "./article-translation.entity.js";

export enum ArticleStatus {
  DRAFT = "draft",
  PUBLISHED = "published",
  ARCHIVED = "archived"
}

@Entity({ name: "article" })
export class Article extends BaseEntity {
  @Column({ type: "enum", default: ArticleStatus.DRAFT, enum: ArticleStatus })
  public status: ArticleStatus

  @Column({ type: "timestamp", nullable: true })
  public publishedAt: Date | null

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "authorId" })
  public author: User | null

  @OneToMany(() => ArticleTranslation, translation => translation.article)
  public translations: Promise<ArticleTranslation[]>
}
