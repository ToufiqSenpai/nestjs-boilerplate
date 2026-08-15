import { CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm"

export class BaseEntity {
  @PrimaryGeneratedColumn("uuid")
  public id: string

  @CreateDateColumn({ type: "timestamptz" })
  public createdAt: Date

  @UpdateDateColumn({ type: "timestamptz" })
  public updatedAt: Date
}
