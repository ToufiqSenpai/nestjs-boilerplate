import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Logger } from "nestjs-pino"
import * as Sentry from "@sentry/nestjs"
import { CreateEmailOptions, Resend } from "resend"
import { createElement, type ComponentProps, type FunctionComponent } from "react"
import { randomUUID } from "node:crypto"
import { EMAIL_TEMPLATES, type EmailTemplateName } from "./templates/index.js"
import { getTranslator, type Locale } from "./i18n/index.js"

interface SendEmailParams<T extends EmailTemplateName> {
  to: string
  template: T
  props: Omit<ComponentProps<(typeof EMAIL_TEMPLATES)[T]>, "locale">
  locale?: Locale
  idempotencyKey?: string
  emailType?: string
  userId: string
}

@Injectable()
export class EmailService {
  private readonly MAX_RETRIES = 3
  private readonly emailFrom: string
  private readonly emailReplyTo?: string

  public constructor(
    private readonly resend: Resend,
    private readonly logger: Logger,
    config: ConfigService
  ) {
    this.emailFrom = config.getOrThrow<string>("email.from")
    this.emailReplyTo = config.get<string>("email.replyTo")
  }

  public async send<T extends EmailTemplateName>({
    to,
    template,
    props,
    locale,
    idempotencyKey,
    emailType = template,
    userId
  }: SendEmailParams<T>): Promise<void> {
    const { translator: t } = getTranslator(locale, template)
    const Component = EMAIL_TEMPLATES[template] as unknown as FunctionComponent<Record<string, unknown>>

    const payload: CreateEmailOptions = {
      from: this.emailFrom,
      to: [to],
      subject: t("subject"),
      react: createElement(Component, {
        ...props,
        locale: locale
      }),
      ...(this.emailReplyTo ? { replyTo: this.emailReplyTo } : {}),
      tags: [
        { name: "email_type", value: emailType },
        { name: "user_id", value: userId }
      ]
    }

    const key = idempotencyKey ?? randomUUID()
    let attempt = 0

    while (true) {
      const result = await this.resend.emails.send(payload, {
        idempotencyKey: key
      })

      const { data, error } = result

      if (!error) {
        this.logger.log(
          {
            event: "email-sent",
            emailType,
            userId,
            messageId: data?.id
          },
          "Email sent"
        )
        return
      }

      const { statusCode } = error
      const retryable = statusCode === 429 || (statusCode != null && statusCode >= 500)

      if (!retryable || attempt === this.MAX_RETRIES - 1) {
        this.logger.error(
          {
            event: "email-send-failed",
            emailType,
            userId,
            statusCode,
            error: error.message
          },
          "Email send failed"
        )
        Sentry.captureException(new Error(`Email send failed: ${error.message}`), {
          level: "error",
          tags: { component: "email", email_type: emailType },
          extra: { userId, statusCode, to }
        })
        return
      }

      const delay = Math.min(1000 * 2 ** attempt, 8000) + Math.random() * 500
      this.logger.warn(
        {
          event: "email-send-retry",
          emailType,
          userId,
          attempt: attempt + 1,
          delayMs: delay
        },
        "Retrying email send"
      )
      await new Promise(resolve => setTimeout(resolve, delay))
      attempt++
    }
  }
}
