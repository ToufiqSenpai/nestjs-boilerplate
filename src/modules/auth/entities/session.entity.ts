import { Column, Entity } from "typeorm";
import { BaseEntity } from "../../../database/entity.js";

@Entity({ name: "session" })
export class Session extends BaseEntity {
  @Column({ type: "text" })
  public userId: string;

  @Column({ type: "text" })
  public token: string;

  @Column({ type: "datetime" })
  public expiresAt: Date;

  @Column({ type: "text", nullable: true })
  public ipAddress: string | null;

  @Column({ type: "text", nullable: true })
  public userAgent: string | null;

  // admin plugin field
  @Column({ type: "text", nullable: true })
  public impersonatedBy: string | null;
}
