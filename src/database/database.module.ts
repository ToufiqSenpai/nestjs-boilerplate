import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { User } from "../modules/auth/entities/user.entity.js";
import { Session } from "../modules/auth/entities/session.entity.js";
import { Account } from "../modules/auth/entities/account.entity.js";
import { Verification } from "../modules/auth/entities/verification.entity.js";
import { TransactionContextService } from "./unit-of-work/transaction-context.service.js";
import { UnitOfWork } from "./unit-of-work/unit-of-work.js";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory(config: ConfigService) {
        return {
          type: "postgres",
          host: config.getOrThrow("DATABASE_HOST"),
          port: config.get("DATABASE_PORT", 5432),
          username: config.getOrThrow("DATABASE_USERNAME"),
          password: config.getOrThrow("DATABASE_PASSWORD"),
          database: config.getOrThrow("DATABASE_NAME"),
          synchronize: process.env.NODE_ENV !== "production",
          entities: [User, Session, Account, Verification]
        }
      },
      inject: [ConfigService]
    }),
  ],
  providers: [TransactionContextService, UnitOfWork],
  exports: [TransactionContextService, UnitOfWork],
})
@Global()
export class DatabaseModule {}
