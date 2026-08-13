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
import { InjectDataSource } from "@nestjs/typeorm"

@Injectable()
@ValidatorConstraint({ async: true })
export class UniqueValidator implements ValidatorConstraintInterface {
  public constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  public validate(value: any, validationArguments?: ValidationArguments): Promise<boolean> | boolean {
    if (!validationArguments) return false

    const [entityClass, property] = validationArguments.constraints

    return this.dataSource
      .getRepository<BaseEntity>(entityClass)
      .exists({ where: { [property]: value } })
      .then(exists => !exists)
  }

  public defaultMessage?(validationArguments?: ValidationArguments): string {
    const [, property] = validationArguments?.constraints || []

    return `${property} already exists.`
  }
}

export function Unique<T extends BaseEntity>(
  entity: new () => T,
  property: keyof T,
  options?: ValidationOptions
): PropertyDecorator {
  return function (target: object, propertyName: string | symbol) {
    registerDecorator({
      name: "Unique",
      target: target.constructor,
      propertyName: propertyName.toString(),
      constraints: [entity, property],
      options: options || {},
      validator: UniqueValidator
    })
  }
}
