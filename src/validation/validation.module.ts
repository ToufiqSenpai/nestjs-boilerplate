import { Module } from "@nestjs/common";
import { UniqueValidator } from "./unique.validator.js"
import { ExistsValidator } from "./exists.validator.js"

@Module({
  providers: [ExistsValidator, UniqueValidator]
})
export class ValidationModule {}
