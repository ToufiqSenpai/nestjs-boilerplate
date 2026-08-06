import { Column, Entity } from "typeorm";
import { BaseEntity } from "../../../database/entity.js";

@Entity({ name: "account" })
export class Account extends BaseEntity {
  @Column({ type: "text" })
  public userId: string;

  @Column({ type: "text" })
  public accountId: string;

  @Column({ type: "text" })
  public providerId: string;

  @Column({ type: "text", nullable: true })
  public accessToken: string | null;

  @Column({ type: "text", nullable: true })
  public refreshToken: string | null;

  @Column({ type: "datetime", nullable: true })
  public accessTokenExpiresAt: Date | null;

  @Column({ type: "datetime", nullable: true })
  public refreshTokenExpiresAt: Date | null;

  @Column({ type: "text", nullable: true })
  public scope: string | null;

  @Column({ type: "text", nullable: true })
  public idToken: string | null;

  @Column({ type: "text", nullable: true })
  public password: string | null;
}
