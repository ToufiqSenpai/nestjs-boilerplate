import { createTranslator, type AbstractIntlMessages } from "next-intl"
import { Logger } from "@nestjs/common"
import en from "./en.json" with { type: "json" }

type TextDirection = "ltr" | "rtl"

interface LocaleRegistry {
  locale: string
  message: Record<string, string | unknown>
  textDirection: TextDirection
}

const LOCALE_REGISTRY: LocaleRegistry[] = [{ locale: "en", message: en, textDirection: "ltr" }] as const

export const DEFAULT_LOCALE = LOCALE_REGISTRY[0]

export type Locale = (typeof LOCALE_REGISTRY)[number]["locale"]

type Translator = (key: string, values?: Record<string, string | number | Date>) => string

interface GetTranslatorReturn {
  translator: Translator
  direction: TextDirection
}

const logger = new Logger(getTranslator.name)

export function getTranslator(locale: Locale, namespace: string): GetTranslatorReturn {
  const resolveLocale = LOCALE_REGISTRY.find(l => l.locale === locale) ?? DEFAULT_LOCALE
  return {
    translator: createTranslator({
      locale: resolveLocale.locale,
      messages: resolveLocale.message as AbstractIntlMessages,
      namespace,
      onError(error) {
        logger.error(error.message, error.stack, error)
      }
    }) as unknown as Translator,
    direction: resolveLocale.textDirection
  }
}
