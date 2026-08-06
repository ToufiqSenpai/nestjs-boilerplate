import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "react-email";
import { tailwindConfig } from "../tailwind.config.js";

interface WelcomeEmailProps {
  name: string;
  verificationUrl: string;
}

export default function WelcomeEmail({
  name,
  verificationUrl,
}: WelcomeEmailProps) {
  return (
    <Html lang="en">
      <Tailwind config={tailwindConfig}>
        <Head />
        <Body className="bg-gray-100 font-sans">
          <Preview>Welcome to Acme — verify your email</Preview>
          <Container className="max-w-xl mx-auto p-5">
            <Section className="bg-white rounded p-6">
              <Heading as="h1" className="text-2xl text-gray-900">
                Welcome, {name}!
              </Heading>
              <Text className="text-gray-700">
                Thanks for signing up. Click the button below to verify your
                email address and get started.
              </Text>
              <Button
                href={verificationUrl}
                className="bg-brand-primary text-white px-5 py-3 rounded block text-center no-underline box-border"
              >
                Verify Email
              </Button>
              <Text className="text-sm text-gray-500">
                If the button does not work, copy and paste this link into your
                browser: {verificationUrl}
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

WelcomeEmail.PreviewProps = {
  name: "John Doe",
  verificationUrl: "https://example.com/verify/abc123",
} satisfies WelcomeEmailProps;

export { WelcomeEmail };
