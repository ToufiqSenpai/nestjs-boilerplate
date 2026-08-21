import { CreateDateColumn, Generated, PrimaryColumn, UpdateDateColumn } from "typeorm"

export class BaseEntity {
  @Generated("uuid")
  @PrimaryColumn("uuid", { default: () => "uuid_generate_v7()" })
  public id: string

  @CreateDateColumn({ type: "timestamptz" })
  public createdAt: Date

  @UpdateDateColumn({ type: "timestamptz" })
  public updatedAt: Date
}
