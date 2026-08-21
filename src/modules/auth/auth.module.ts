import { Global, Logger, Module } from "@nestjs/common"
import { DataSource } from "typeorm"
import { betterAuth } from "better-auth"
import { admin, openAPI } from "better-auth/plugins"
import { hash, verify, type Options } from "@node-rs/argon2"
import { v7 as uuidv7 } from "uuid"
import { AuthModule as BetterAuthModule } from "@thallesp/nestjs-better-auth"
import { createDatabaseAdapter } from "./database-adapter.js"
import { EmailService } from "../../email/email.service.js"
import { config } from "../../config/index.js"

const ARGON2_OPTIONS: Options = {
  memoryCost: 37888, // 37 MiB
  timeCost: 3, // 3 iterations
  parallelism: 1, // 1 parallel lane
  outputLen: 32, // 32 byte output
  algorithm: 2 // Argon2id variant
}

const logger = new Logger("AuthModule")

@Module({
  imports: [
    BetterAuthModule.forRootAsync({
      useFactory(dataSource: DataSource, emailService: EmailService) {
        const auth = betterAuth({
          database: createDatabaseAdapter(dataSource),
          logger: {
            level: "info",
            log: (level, message, ...args) => {
              switch (level) {
                case "debug":
                  logger.debug(message, ...args)
                  break
                case "info":
                  logger.log(message, ...args)
                  break
                case "warn":
                  logger.warn(message, ...args)
                  break
                case "error":
                  logger.error(message, ...args)
                  break
              }
            }
          },
          secret: config.auth.secret,
          baseURL: config.app.baseURL,
          trustedOrigins: config.app.origins,
          socialProviders: {
            google: {
              clientId: config.auth.google.clientId,
              clientSecret: config.auth.google.clientSecret
            }
          },
          rateLimit: {
            enabled: config.app.environment !== "test",
            window: 10,
            max: 100,
            customRules: {
              "/sign-in/email": { window: 60, max: 5 },
              "/sign-up/email": {
                window: 60,
                max: 3
              }
            }
          },
          advanced: {
            generateId: () => uuidv7(),
            database: {
              generateId: () => uuidv7()
            },
            ipAddress: {
              ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
              trustedProxies: ["127.0.0.1", "172.16.0.0/12"]
            }
          },
          emailAndPassword: {
            enabled: true,
            requireEmailVerification: true,
            resetPasswordTokenExpiresIn: 60 * 30,
            revokeSessionsOnPasswordReset: true,
            autoSignIn: true,
            password: {
              hash: password => hash(password, ARGON2_OPTIONS),
              verify: ({ password, hash: storedHash }) => verify(storedHash, password, ARGON2_OPTIONS)
            },
            sendResetPassword: async ({ user, url }) => {
              void emailService
                .send({
                  to: user.email,
                  template: "reset-password",
                  props: {
                    name: user.name,
                    email: user.email,
                    resetUrl: url,
                    expiresInMinutes: 30
                  },
                  userId: user.id
                })
                .catch(() => {})
            },
            onPasswordReset: async ({ user }) => {
              logger.log({ event: "password-reset", userId: user.id }, "Password reset completed")
            },
            onExistingUserSignUp: async ({ user }) => {
              logger.warn({ event: "signup", userId: user.id }, "Sign-up attempt for existing email")
            }
          },
          emailVerification: {
            sendVerificationEmail: async ({ user, url }) => {
              void emailService
                .send({
                  to: user.email,
                  template: "verification",
                  props: {
                    name: user.name,
                    verificationUrl: url,
                    expiresInMinutes: 30
                  },
                  userId: user.id
                })
                .catch(() => {})
            },
            expiresIn: 60 * 30,
            sendOnSignUp: true,
            beforeEmailVerification: async user => {
              logger.log({ event: "email-verification-attempt", userId: user.id }, "Email verification processed")
            },
            afterEmailVerification: async user => {
              logger.log({ event: "email-verified", userId: user.id }, "Email verified successfully")
            }
          },
          plugins: [admin(), ...(config.app.environment === "development" ? [openAPI()] : [])],
          databaseHooks: {
            session: {
              create: {
                after: async session => {
                  logger.log({ event: "session-created", userId: session.userId }, "Session created")
                }
              },
              delete: {
                before: async session => {
                  logger.log({ event: "session-revoked", sessionId: session.id }, "Session revoked")
                }
              }
            },
            user: {
              update: {
                after: async user => {
                  logger.log({ event: "user-updated", userId: user.id }, "User updated")
                }
              }
            },
            account: {
              create: {
                after: async account => {
                  logger.log(
                    {
                      event: "account-linked",
                      userId: account.userId,
                      provider: account.providerId
                    },
                    "Account linked"
                  )
                }
              }
            }
          }
        })
        return { auth }
      },
      inject: [DataSource, EmailService]
    })
  ],
  exports: [BetterAuthModule]
})
@Global()
export class AuthModule {}
