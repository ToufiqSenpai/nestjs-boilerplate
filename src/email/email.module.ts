import { Global, Module } from "@nestjs/common"
import { Resend } from "resend"
import { ConfigService } from "@nestjs/config"
import { EmailService } from "./email.service.js"

@Global()
@Module({
  providers: [
    {
      provide: Resend,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new Resend(config.getOrThrow("RESEND_API_KEY"))
    },
    EmailService
  ],
  exports: [Resend, EmailService]
})
export class EmailModule {}
