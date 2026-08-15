import { Module } from "@nestjs/common";
import { S3Client } from "@aws-sdk/client-s3"
import { config } from "../config/index.js";

@Module({
  providers: [
    {
      provide: S3Client,
      useValue: new S3Client({
        region: config.s3.region,
        endpoint: config.s3.endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.s3.accessKeyId,
          secretAccessKey: config.s3.secretAccessKey
        }
      }),
    }
  ],
  exports: [S3Client]
})
export class StorageModule {}
