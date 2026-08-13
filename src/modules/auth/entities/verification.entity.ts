import { Column, Entity } from "typeorm"
import { BaseEntity } from "../../../database/base.entity.js"

@Entity({ name: "verification" })
export class Verification extends BaseEntity {
  @Column({ type: "text" })
  public identifier: string

  @Column({ type: "text" })
  public value: string

  @Column({ type: "timestamp" })
  public expiresAt: Date
}
