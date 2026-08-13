import { Module } from "@nestjs/common";
import { S3Client } from "@aws-sdk/client-s3"
import { ConfigService } from "@nestjs/config";

@Module({
  providers: [
    {
      provide: S3Client,
      useFactory(config: ConfigService) {
        return new S3Client({
          region: config.get("S3_REGION"),
          endpoint: config.get("S3_ENDPOINT"),
          forcePathStyle: true,
          credentials: {
            accessKeyId: config.getOrThrow("S3_ACCESS_KEY_ID"),
            secretAccessKey: config.getOrThrow("S3_SECRET_ACCESS_KEY")
          }
        })
      },
      inject: [ConfigService]
    }
  ],
  exports: [S3Client]
})
export class StorageModule {}
