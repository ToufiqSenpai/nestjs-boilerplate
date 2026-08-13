import { Injectable } from "@nestjs/common"
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from "class-validator"
import { BaseEntity } from "../database/base.entity.js"
import { DataSource } from "typeorm"

@Injectable()
@ValidatorConstraint({ name: "Exists", async: true })
export class ExistsValidator implements ValidatorConstraintInterface {
  public constructor(private readonly dataSource: DataSource) {}

  public async validate(value: any, validationArguments?: ValidationArguments): Promise<boolean> {
    if (!validationArguments) return false

    const [entityClass, property] = validationArguments.constraints

    return this.dataSource.getRepository<BaseEntity>(entityClass).exists({ where: { [property]: value } })
  }

  public defaultMessage?(validationArguments?: ValidationArguments): string {
    const [, property] = validationArguments?.constraints || []

    return `${property} does not exist.`
  }
}

export function Exists<E extends BaseEntity>(
  entity: new () => E,
  property: keyof E,
  options?: ValidationOptions
): PropertyDecorator {
  return function (target: object, propertyName: string | symbol) {
    registerDecorator({
      name: "Exists",
      target: target.constructor,
      propertyName: propertyName.toString(),
      constraints: [entity, property],
      options: options || {},
      validator: ExistsValidator
    })
  }
}
