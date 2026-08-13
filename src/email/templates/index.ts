import VerificationEmail from "./verification.js"
import ResetPassword from "./reset-password.js"

export const EMAIL_TEMPLATES = {
  verification: VerificationEmail,
  "reset-password": ResetPassword
} as const

export type EmailTemplateName = keyof typeof EMAIL_TEMPLATES
