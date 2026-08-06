import { ApiProperty } from "@nestjs/swagger"
import { CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

export class BaseEntity {
  @PrimaryGeneratedColumn("uuid")
  @ApiProperty({ readOnly: true })
  public id: string

  @CreateDateColumn()
  @ApiProperty({ readOnly: true })
  public createdAt: Date

  @UpdateDateColumn()
  @ApiProperty({ readOnly: true })
  public updatedAt: Date
}
