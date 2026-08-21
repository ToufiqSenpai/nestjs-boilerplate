import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm"
import { BaseEntity } from "../../../database/base.entity.js"
import { User } from "./user.entity.js"

@Entity()
@Index("IDX_account_userId", ["userId"])
export class Account extends BaseEntity {
  @Column({ type: "uuid" })
  public userId: string

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  public user: Promise<User>

  @Column({ type: "text" })
  public accountId: string

  @Column({ type: "text" })
  public providerId: string

  @Column({ type: "text", nullable: true })
  public accessToken: string | null

  @Column({ type: "text", nullable: true })
  public refreshToken: string | null

  @Column({ type: "timestamp", nullable: true })
  public accessTokenExpiresAt: Date | null

  @Column({ type: "timestamp", nullable: true })
  public refreshTokenExpiresAt: Date | null

  @Column({ type: "text", nullable: true })
  public scope: string | null

  @Column({ type: "text", nullable: true })
  public idToken: string | null

  @Column({ type: "text", nullable: true })
  public password: string | null
}
