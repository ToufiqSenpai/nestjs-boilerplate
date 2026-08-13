import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from "class-validator"

@ValidatorConstraint({ name: "Match", async: false })
export class MatchConstraint implements ValidatorConstraintInterface {
  public validate(value: any, validationArguments: ValidationArguments): boolean {
    const [relatedPropertyPath] = validationArguments.constraints
    const comparedValue = relatedPropertyPath
      .split(".")
      .reduce((obj: any, key: string) => obj && obj[key], validationArguments.object)

    return value === comparedValue
  }

  public defaultMessage(validationArguments: ValidationArguments): string {
    const [relatedPropertyPath] = validationArguments.constraints

    return `${validationArguments.property} must match ${relatedPropertyPath} exactly`
  }
}

export function Match(propertyPath: string, validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName.toString(),
      options: validationOptions || {},
      constraints: [propertyPath],
      validator: MatchConstraint
    })
  }
}
