import * as Sentry from "@sentry/nestjs"
import { pinoIntegration } from "@sentry/nestjs"
import { secrets } from "./config/infisical.js"

Sentry.init({
  dsn: process.env.NODE_ENV === "test" ? undefined : secrets.SENTRY_DSN,
  enabled: process.env.NODE_ENV !== "test",
  environment: process.env.NODE_ENV,
  dataCollection: {
    userInfo: false,
    httpBodies: [],
    cookies: false
  },
  enableLogs: true,
  integrations: [pinoIntegration()],
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
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
