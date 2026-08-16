import pino from "pino"
import { Logger, PinoLogger, type Params } from "nestjs-pino"
import { config } from "../config/index.js"

const pinoInstance = pino({
  transport: {
    target: "pino-pretty",
    options: {
      singleLine: true,
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname"
    }
  },
  level: config.log.level
})

const params: Params = {
  pinoHttp: { logger: pinoInstance }
}

export const logger = new Logger(new PinoLogger(params), params)
