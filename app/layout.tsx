import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import { COMPANY, SITE_URL } from "@/lib/config/company";
import { SessionProvider } from "@/components/portal/SessionProvider";
import { headers } from "next/headers";
import { LOCALE_HEADER } from "@/lib/config/routes";
import { routing } from "@/i18n/routing";
import "./globals.css";

/**
 * Fonts are VENDORED, not fetched.
 *
 * `next/font/google` downloads the font files AT BUILD TIME. That turns every
 * build — CI, and the production deploy on the box — into a request to
 * fonts.gstatic.com, and makes shipping depend on a third party being reachable
 * from wherever the build happens to run. It failed three times in one
 * afternoon: twice on the box mid-deploy and once on a GitHub runner, each time
 * as "Module not found: @vercel/turbopack-next/internal/font/google/font",
 * which reads like a broken import and is really a failed download.
 *
 * The files below are the same woff2 files Google would have served, committed
 * to the repo. Builds are now hermetic and the typography cannot change without
 * a diff. Total cost: ~133 KB, latin subset only, which is what this site uses.
 *
 * To update a face: re-download the latin subset from Google Fonts and commit it.
 */
const cormorant = localFont({
  src: [
    { path: "../public/fonts/CormorantGaramond-Light.woff2", weight: "300", style: "normal" },
    { path: "../public/fonts/CormorantGaramond-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/CormorantGaramond-LightItalic.woff2", weight: "300", style: "italic" },
    { path: "../public/fonts/CormorantGaramond-Italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-cormorant",
  display: "swap",
});

const dmSans = localFont({
  src: [
    { path: "../public/fonts/DMSans-Light.woff2", weight: "300", style: "normal" },
    { path: "../public/fonts/DMSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/DMSans-Medium.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-dm-sans",
  display: "swap",
});

const TITLE = `${COMPANY.shortName} · Metabolic Psychiatry & Systemic Longevity · Zürich`;
const DESCRIPTION =
  "We go beyond diagnosis. We decode the biology behind your mind — and the environment around it — to design a personalised path to sustained high performance, longevity and wellbeing.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: COMPANY.name,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Locale is injected by proxy.ts middleware from the URL pathname so crawlers
  // see the correct <html lang> on every request, regardless of cookies.
  const headersList = await headers();
  const headerLocale = headersList.get(LOCALE_HEADER);
  const locale = (routing.locales as readonly string[]).includes(headerLocale ?? "")
    ? headerLocale!
    : routing.defaultLocale;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MedicalBusiness",
    name: COMPANY.name,
    description: DESCRIPTION,
    url: SITE_URL,
    email: COMPANY.email,
    foundingDate: String(COMPANY.foundingYear),
    address: {
      "@type": "PostalAddress",
      streetAddress: COMPANY.address.street,
      postalCode: COMPANY.address.zip,
      addressLocality: COMPANY.address.city,
      addressCountry: "CH",
    },
    medicalSpecialty: ["Psychiatry", "Metabolic Medicine", "Longevity Medicine"],
  };

  return (
    <html lang={locale} className={`${cormorant.variable} ${dmSans.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <SessionProvider>{children}</SessionProvider>

        {/* FleetCrown feedback widget — env-gated, see docs/architecture/feedback-widget.md */}
        {process.env.NEXT_PUBLIC_FC_WIDGET_TOKEN && (
          <Script
            src="https://fleetcrown.orangecat.ch/widget.js"
            strategy="afterInteractive"
            data-fc-project={process.env.NEXT_PUBLIC_FC_WIDGET_TOKEN}
          />
        )}
      </body>
    </html>
  );
}
