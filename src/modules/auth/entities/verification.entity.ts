import { Column, Entity } from "typeorm"
import { BaseEntity } from "../../../database/base.entity.js"

@Entity()
export class Verification extends BaseEntity {
  @Column({ type: "text" })
  public identifier: string

  @Column({ type: "text" })
  public value: string

  @Column({ type: "text" })
  public expiresAt: Date
}
