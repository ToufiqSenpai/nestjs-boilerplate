import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "react-email";
import { tailwindConfig } from "../tailwind.config.js";

interface VerificationEmailProps {
  name: string;
  verificationUrl: string;
  expiresInMinutes?: number;
}

export default function VerificationEmail({
  name,
  verificationUrl,
  expiresInMinutes = 30,
}: VerificationEmailProps) {
  return (
    <Html lang="en" dir="ltr">
      <Tailwind config={tailwindConfig}>
        <Head />
        <Body className="bg-background font-sans">
          <Preview>Verify your email address for Acme</Preview>
          <Container lang="en" dir="ltr" className="mx-auto py-10 px-5 max-w-xl">
            <Section className="bg-surface rounded p-6">
              <Heading as="h1" className="text-2xl font-bold text-gray-800">
                Verify your email address
              </Heading>
              <Text className="text-base leading-7 text-gray-800">
                Hi {name}, thanks for signing up. Confirm this email address to
                activate your Acme account.
              </Text>
              <Button
                href={verificationUrl}
                className="bg-brand-primary text-white px-7 py-3.5 rounded block text-center font-bold my-6 no-underline box-border"
              >
                Verify Email
              </Button>
              <Text className="text-sm text-gray-500 leading-5">
                This link expires in {expiresInMinutes} minutes.
              </Text>
              <Hr className="border-solid border-gray-200 my-6" />
              <Text className="text-sm text-gray-500 leading-5">
                If you didn't create an account with Acme, you can safely ignore
                this email.
              </Text>
              <Text className="text-sm text-gray-500 leading-5">
                If the button does not work, copy and paste this link into your
                browser:
              </Text>
              <Link href={verificationUrl} className="text-sm text-brand-secondary break-all">
                {verificationUrl}
              </Link>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

VerificationEmail.PreviewProps = {
  name: "John Doe",
  verificationUrl: "https://example.com/verify/abc123",
  expiresInMinutes: 30,
} satisfies VerificationEmailProps;

export { VerificationEmail };
