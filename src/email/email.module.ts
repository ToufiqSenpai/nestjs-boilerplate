import { Global, Module } from "@nestjs/common";
import { Resend } from "resend";
import { ConfigService } from "@nestjs/config";

@Global()
@Module({
  providers: [
    {
      provide: Resend,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Resend(config.getOrThrow("RESEND_API_KEY")),
    },
  ],
  exports: [Resend],
})
export class EmailModule {}
