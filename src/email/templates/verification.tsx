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
import {
  getTranslator,
  type Locale,
} from "../../i18n/index.js";

interface VerificationEmailProps {
  name: string;
  verificationUrl: string;
  expiresInMinutes: number;
  locale: Locale;
}

export default function Verification({
  name,
  verificationUrl,
  expiresInMinutes,
  locale,
}: VerificationEmailProps) {
  const { translator: t, direction } = getTranslator(locale, "verification");

  return (
    <Html lang={locale} dir={direction}>
      <Tailwind config={tailwindConfig}>
        <Head />
        <Body className="bg-background font-sans">
          <Preview>{t("preview")}</Preview>
          <Container className="mx-auto py-10 px-5 max-w-xl">
            <Section className="bg-surface rounded p-6">
              <Heading as="h1" className="text-2xl font-bold text-gray-800">
                {t("title")}
              </Heading>
              <Text className="text-base leading-7 text-gray-800">
                {t("intro", { name })}
              </Text>
              <Button
                href={verificationUrl}
                className="bg-brand-primary text-white px-7 py-3.5 rounded block text-center font-bold my-6 no-underline box-border"
              >
                {t("cta")}
              </Button>
              <Text className="text-sm text-gray-500 leading-5">
                {t("expires", { expires: expiresInMinutes })}
              </Text>
              <Hr className="border-solid border-gray-200 my-6" />
              <Text className="text-sm text-gray-500 leading-5">
                {t("ignore")}
              </Text>
              <Text className="text-sm text-gray-500 leading-5">
                {t("fallbackLabel")}
              </Text>
              <Link
                href={verificationUrl}
                className="text-sm text-brand-secondary break-all"
              >
                {verificationUrl}
              </Link>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

Verification.PreviewProps = {
  name: "John Doe",
  verificationUrl: "https://example.com/verify/abc123",
  expiresInMinutes: 30,
  locale: "en",
} satisfies VerificationEmailProps;
