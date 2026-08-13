import { Global, Module } from "@nestjs/common"
import { ConfigModule as NestConfigModule } from "@nestjs/config"
import { access, readFile } from "fs/promises"
import { resolve } from "path"
import _ from "lodash"
import { secrets } from "./infisical.js"

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      load: [
        async (): Promise<any> => {
          const env = process.env.NODE_ENV || "development"
          const configDir = import.meta.dirname
          const defaultConfigPath = resolve(configDir, "config.json")
          const envConfigPath = resolve(configDir, `config.${env}.json`)
          let config = JSON.parse(await readFile(defaultConfigPath, "utf-8"))

          try {
            await access(envConfigPath)
            const envConfig = JSON.parse(await readFile(envConfigPath, "utf-8"))
            config = _.merge(config, envConfig)
          } catch (err: any) {
            if (err?.code !== "ENOENT") throw err
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
    NODE_ENV: "development" | "production" | "test"
  }
}
