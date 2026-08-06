import { Column, Entity } from "typeorm";
import { BaseEntity } from "../../../database/entity.js";

@Entity({ name: "verification" })
export class Verification extends BaseEntity {
  @Column({ type: "text" })
  public identifier: string;

  @Column({ type: "text" })
  public value: string;

  @Column({ type: "datetime" })
  public expiresAt: Date;
}
