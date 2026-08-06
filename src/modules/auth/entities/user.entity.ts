import { Column, Entity } from "typeorm";
import { BaseEntity } from "../../../database/entity.js";

@Entity({ name: "user" })
export class User extends BaseEntity {
  @Column({ type: "text" })
  public name: string;

  @Column({ type: "text", unique: true })
  public email: string;

  @Column({ type: "boolean", default: false })
  public emailVerified: boolean;

  @Column({ type: "text", nullable: true })
  public image: string | null;

  // admin plugin fields
  @Column({ type: "text", nullable: true })
  public role: string | null;

  @Column({ type: "boolean", default: false })
  public banned: boolean;

  @Column({ type: "text", nullable: true })
  public banReason: string | null;

  @Column({ type: "datetime", nullable: true })
  public banExpires: Date | null;
}
