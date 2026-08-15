import { Global, Module } from "@nestjs/common"
import { Resend } from "resend"
import { EmailService } from "./email.service.js"
import { config } from "../config/index.js"

@Global()
@Module({
  providers: [
    {
      provide: Resend,
      useValue: new Resend(config.email.resendAPIKey)
    },
    EmailService
  ],
  exports: [Resend, EmailService]
})
export class EmailModule {}
