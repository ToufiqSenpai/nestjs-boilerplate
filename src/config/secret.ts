import { InfisicalSDK } from "@infisical/sdk"

process.loadEnvFile(".env")

const clientId = process.env.INFISICAL_CLIENT_ID ?? ""
const clientSecret = process.env.INFISICAL_CLIENT_SECRET ?? ""
const projectId = process.env.INFISICAL_PROJECT_ID ?? ""

const infisical = new InfisicalSDK()

await infisical.auth().universalAuth.login({
  clientId,
  clientSecret
})

const allSecrets = await infisical.secrets().listSecrets({
  environment: process.env.NODE_ENV || "development",
  projectId
})

for (const { secretKey, secretValue } of allSecrets.secrets) {
  process.env[secretKey] = secretValue
}
