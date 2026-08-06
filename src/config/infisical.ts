import { InfisicalSDK } from "@infisical/sdk"

const clientId = process.env.INFISICAL_CLIENT_ID
const clientSecret = process.env.INFISICAL_CLIENT_SECRET
const projectId = process.env.INFISICAL_PROJECT_ID

const infisical = new InfisicalSDK()

await infisical.auth().universalAuth.login({
  clientId: clientId,
  clientSecret: clientSecret
})

const allSecrets = await infisical.secrets().listSecrets({
  environment: process.env.NODE_ENV || "development",
  projectId: projectId
})

export const secrets = allSecrets.secrets.reduce(
  (acc, secret) => {
    acc[secret.secretKey] = secret.secretValue
    return acc
  },
  {} as Record<string, any>
)
