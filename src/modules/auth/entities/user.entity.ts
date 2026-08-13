import { Column, Entity, OneToMany } from "typeorm"
import { BaseEntity } from "../../../database/base.entity.js"
import { Account } from "./account.entity.js"
import { Session } from "./session.entity.js"

@Entity({ name: "user" })
export class User extends BaseEntity {
  @Column({ type: "text" })
  public name: string

  @Column({ type: "text", unique: true })
  public email: string

  @Column({ type: "boolean", default: false })
  public emailVerified: boolean

  @Column({ type: "text", nullable: true })
  public image: string | null

  // admin plugin fields
  @Column({ type: "text", nullable: true })
  public role: string | null

  @Column({ type: "boolean", default: false })
  public banned: boolean

  @Column({ type: "text", nullable: true })
  public banReason: string | null

  @Column({ type: "timestamp", nullable: true })
  public banExpires: Date | null

  @OneToMany(() => Account, account => account.user)
  public accounts: Promise<Account[]>

  @OneToMany(() => Session, session => session.user)
  public sessions: Promise<Session[]>

  @OneToMany(() => Session, session => session.impersonatedByUser)
  public impersonatedSessions: Promise<Session[]>
}
