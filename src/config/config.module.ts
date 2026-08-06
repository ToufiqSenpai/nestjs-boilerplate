import { Global, Module } from "@nestjs/common"
import { ConfigModule as NestConfigModule } from "@nestjs/config"
import { existsSync, readFileSync } from "fs"
import { resolve } from "path"
import _ from "lodash"
import { secrets } from "./infisical.js"

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env"],
      load: [
        async (): Promise<any> => {
          const env = process.env.NODE_ENV || "development"
          const configDir = import.meta.dirname
          const defaultConfigPath = resolve(configDir, "config.json")
          const envConfigPath = resolve(configDir, `config.${env}.json`)
          let config = JSON.parse(readFileSync(defaultConfigPath, "utf-8"))

          if (existsSync(envConfigPath)) {
            const envConfig = JSON.parse(readFileSync(envConfigPath, "utf-8"))
            config = _.merge(config, envConfig)
          }

          config = _.merge(config, secrets)

          return config
        }
      ]
    })
  ]
})
export class ConfigModule {}

// eslint-disable-next-line
declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: "development" | "production" | "test";
  }
}
