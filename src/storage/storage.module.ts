import { Global, Module } from "@nestjs/common";
import { S3Client } from "@aws-sdk/client-s3"
import { config } from "../config/index.js";
import { Storage } from "./storage.js";
import { FormInterceptor } from "../libs/form/form.interceptor.js";

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
    },
    Storage,
    FormInterceptor
  ],
  exports: [Storage, FormInterceptor]
})
@Global()
export class StorageModule {}
