import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { COMPANY, SITE_URL } from "@/lib/config/company";
import { AssessmentOverlay } from "@/components/sections/AssessmentOverlay";

// Maps next-intl locale codes to OpenGraph locale identifiers (Swiss variants where applicable).
const OG_LOCALE: Record<string, string> = {
  de: "de_CH",
  en: "en_US",
  fr: "fr_CH",
  it: "it_CH",
};

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });

  const title = `${COMPANY.shortName} · ${t("tagline")} · ${COMPANY.address.city}`;
  const description = t("description");
  const url = `${SITE_URL}/${locale}`;

  // Build hreflang map for all supported locales
  const languages = Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}`]));

  return {
    title,
    description,
    alternates: { canonical: url, languages },
    openGraph: {
      title,
      description,
      url,
      siteName: COMPANY.name,
      type: "website",
      locale: OG_LOCALE[locale] ?? OG_LOCALE.de,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <AssessmentOverlay />
      {children}
    </NextIntlClientProvider>
  );
}
