import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm"
import { BaseEntity } from "../../../database/base.entity.js"
import { User } from "./user.entity.js"

@Entity({ name: "session" })
@Index("IDX_session_userId", ["userId"])
export class Session extends BaseEntity {
  @Column({ type: "text" })
  public userId: string

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  public user: Promise<User>

  @Column({ type: "text" })
  public token: string

  @Column({ type: "timestamp" })
  public expiresAt: Date

  @Column({ type: "text", nullable: true })
  public ipAddress: string | null

  @Column({ type: "text", nullable: true })
  public userAgent: string | null

  // admin plugin field
  @Column({ type: "text", nullable: true })
  public impersonatedBy: string | null

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "impersonatedBy" })
  public impersonatedByUser: Promise<User | null>
}
