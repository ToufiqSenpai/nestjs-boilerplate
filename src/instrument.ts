import "dotenv/config";
import * as Sentry from "@sentry/nestjs";
import { secrets } from "./config/infisical.js";

Sentry.init({
  dsn: secrets.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
