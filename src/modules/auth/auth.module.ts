import { Global, Module } from "@nestjs/common";
import { Logger } from "nestjs-pino";
import { DataSource } from "typeorm";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { hash, verify, type Options } from "@node-rs/argon2";
import { AuthModule as BetterAuthModule } from "@thallesp/nestjs-better-auth";
import { createTypeormAdapter } from "./typeorm-adapter.js";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import { createElement, type ReactNode } from "react";
import { VerificationEmail } from "../../email/templates/verification.js";
import { ResetPasswordEmail } from "../../email/templates/reset-password.js";

const ARGON2_OPTIONS: Options = {
  memoryCost: 37888, // 37 MiB
  timeCost: 3, // 3 iterations
  parallelism: 1, // 1 parallel lane
  outputLen: 32, // 32 byte output
  algorithm: 2, // Argon2id variant
};

@Module({
  imports: [
    BetterAuthModule.forRootAsync({
      useFactory(
        dataSource: DataSource,
        config: ConfigService,
        logger: Logger,
        resend: Resend,
      ) {
        const emailFrom = config.getOrThrow<string>("email.from");
        const emailReplyTo = config.get<string>("email.replyTo");

        const sleep = (ms: number) =>
          new Promise((resolve) => setTimeout(resolve, ms));

        const sendEmail = async ({
          to,
          subject,
          react,
          idempotencyKey,
          emailType,
          userId,
        }: {
          to: string;
          subject: string;
          react: ReactNode;
          idempotencyKey: string;
          emailType: string;
          userId: string;
        }) => {
          const payload = {
            from: emailFrom,
            to: [to],
            subject,
            react,
            ...(emailReplyTo ? { replyTo: emailReplyTo } : {}),
            tags: [
              { name: "email_type", value: emailType },
              { name: "user_id", value: userId },
            ],
          };

          const maxRetries = 3;
          for (let attempt = 0; attempt < maxRetries; attempt++) {
            const { data, error } = await resend.emails.send(payload, {
              idempotencyKey,
            });

            if (!error) {
              logger.log(
                {
                  event: "email-sent",
                  emailType,
                  userId,
                  messageId: data?.id,
                },
                "Email sent",
              );
              return;
            }

            const statusCode = (error as { statusCode?: number })
              ?.statusCode;
            const retryable =
              statusCode === 429 || (statusCode != null && statusCode >= 500);

            if (!retryable || attempt === maxRetries - 1) {
              logger.error(
                {
                  event: "email-send-failed",
                  emailType,
                  userId,
                  statusCode,
                  error: error.message,
                },
                "Email send failed",
              );
              return;
            }

            const delay = Math.min(1000 * 2 ** attempt, 8000) + Math.random() * 500;
            logger.warn(
              {
                event: "email-send-retry",
                emailType,
                userId,
                attempt: attempt + 1,
                delayMs: delay,
              },
              "Retrying email send",
            );
            await sleep(delay);
          }
        };

        const auth = betterAuth({
          database: createTypeormAdapter(dataSource),
          logger: {
            level: "info",
            log: (level, message, ...args) => {
              switch (level) {
                case "debug":
                  logger.debug(message, ...args);
                  break;
                case "info":
                  logger.log(message, ...args);
                  break;
                case "warn":
                  logger.warn(message, ...args);
                  break;
                case "error":
                  logger.error(message, ...args);
                  break;
              }
            },
          },
          secret: config.getOrThrow("BETTER_AUTH_SECRET"),
          baseURL: config.getOrThrow("app.baseURL"),
          trustedOrigins: config.getOrThrow<string[]>("app.origins"),
          socialProviders: {
            google: {
              clientId: config.getOrThrow("GOOGLE_CLIENT_ID"),
              clientSecret: config.getOrThrow("GOOGLE_CLIENT_SECRET"),
            },
          },
          rateLimit: {
            enabled: true,
            window: 10,
            max: 100,
            customRules: {
              "/api/auth/sign-in/email": { window: 60, max: 5 },
              "/api/auth/sign-up/email": { window: 60, max: 3 },
            },
          },
          advanced: {
            ipAddress: {
              ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
              trustedProxies: ["127.0.0.1", "172.16.0.0/12"],
            },
          },
          emailAndPassword: {
            enabled: true,
            requireEmailVerification: true,
            resetPasswordTokenExpiresIn: 60 * 30,
            revokeSessionsOnPasswordReset: true,
            autoSignIn: true,
            password: {
              hash: (password) => hash(password, ARGON2_OPTIONS),
              verify: ({ password, hash: storedHash }) =>
                verify(storedHash, password, ARGON2_OPTIONS),
            },
            sendResetPassword: async ({ user, url, token }) => {
              await sendEmail({
                to: user.email,
                subject: "Reset your password for Acme",
                react: createElement(ResetPasswordEmail, {
                  name: user.name,
                  email: user.email,
                  resetUrl: url,
                }),
                idempotencyKey: `password-reset/${user.id}-${token}`,
                emailType: "password-reset",
                userId: user.id,
              });
            },
            onPasswordReset: async ({ user }) => {
              logger.log(
                { event: "password-reset", userId: user.id },
                "Password reset completed",
              );
            },
            onExistingUserSignUp: async ({ user }) => {
              logger.warn(
                { event: "signup", userId: user.id },
                "Sign-up attempt for existing email",
              );
            },
          },
          emailVerification: {
            sendVerificationEmail: async ({ user, url, token }) => {
              await sendEmail({
                to: user.email,
                subject: "Verify your email for Acme",
                react: createElement(VerificationEmail, {
                  name: user.name,
                  verificationUrl: url,
                }),
                idempotencyKey: `verification-email/${user.id}-${token}`,
                emailType: "verification",
                userId: user.id,
              });
            },
            expiresIn: 60 * 30,
            sendOnSignUp: true,
            beforeEmailVerification: async (user) => {
              logger.log(
                { event: "email-verification-attempt", userId: user.id },
                "Email verification processed",
              );
            },
            afterEmailVerification: async (user) => {
              logger.log(
                { event: "email-verified", userId: user.id },
                "Email verified successfully",
              );
            },
          },
          plugins: [admin()],
          databaseHooks: {
            session: {
              create: {
                after: async (session) => {
                  logger.log(
                    { event: "session-created", userId: session.userId },
                    "Session created",
                  );
                },
              },
              delete: {
                before: async (session) => {
                  logger.log(
                    { event: "session-revoked", sessionId: session.id },
                    "Session revoked",
                  );
                },
              },
            },
            user: {
              update: {
                after: async (user) => {
                  logger.log(
                    { event: "user-updated", userId: user.id },
                    "User updated",
                  );
                },
              },
            },
            account: {
              create: {
                after: async (account) => {
                  logger.log(
                    {
                      event: "account-linked",
                      userId: account.userId,
                      provider: account.providerId,
                    },
                    "Account linked",
                  );
                },
              },
            },
          },
        })
        return { auth };
      },
      inject: [DataSource, ConfigService, Logger, Resend],
    }),
  ],
  exports: [BetterAuthModule],
})
@Global()
export class AuthModule {}
