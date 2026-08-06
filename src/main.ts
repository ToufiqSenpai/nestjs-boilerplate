import "./instrument.js";
import { NestFactory } from '@nestjs/core';
import { Logger } from "nestjs-pino"
import { ConfigService } from "@nestjs/config"
import { AppModule } from './app.module.js';

const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.enableShutdownHooks();
app.useLogger(app.get(Logger))

const config = app.get(ConfigService)
app.enableCors({
  origin: config.get<string[]>("app.origins", []),
  credentials: true,
})

await app.listen(config.get<number>("app.port", 8080));
