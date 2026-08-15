import * as Sentry from "@sentry/nestjs"
import { pinoIntegration } from "@sentry/nestjs"
import { config } from "./config/index.js"

Sentry.init({
  dsn: config.sentry.dsn,
  enabled: config.app.environment !== "test",
  environment: config.app.environment,
  dataCollection: {
    userInfo: false,
    httpBodies: [],
    cookies: false
  },
  enableLogs: true,
  integrations: [pinoIntegration()],
  tracesSampleRate: config.app.environment === "production" ? 0.1 : 1.0,
  ignoreErrors: ["ECONNRESET", /^ETIMEDOUT/],
  beforeSend(event) {
    const headers = event.request?.headers as Record<string, string> | undefined
    if (headers?.["authorization"]) {
      headers["authorization"] = "[filtered]"
    }
    if (headers?.["cookie"]) {
      headers["cookie"] = "[filtered]"
    }
    if (event.user?.email) {
      event.user.email = "[filtered]"
    }
    return event
  },
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.category === "http" && breadcrumb.message?.includes("/health")) {
      return null
    }
    return breadcrumb
  }
})
