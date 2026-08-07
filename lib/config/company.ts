export const COMPANY = {
  name: "VitaReBa GmbH",
  shortName: "VitaReBa",
  clinicianName: "Manuel",
  partnerBrand: "Surf Your Life",
  email: "manuel@surfyourlife.org",
  address: {
    street: "Zollikerstrasse 183",
    zip: "8008",
    city: "Zürich",
  },
  foundingYear: 2026,
} as const;

// Single source of truth for the deployed portal URL used in emails and cron routes
export const PORTAL_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://vitareba.ch";

// Public-facing marketing site URL used in SEO metadata, robots.txt, and sitemap.
// Fallback is where the site ACTUALLY serves: vitareba.ch has no DNS A record,
// so metadataBase, canonical URLs, the sitemap and the generated og:image all
// named a host that does not resolve. Point it back once that domain is live.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vitareba.orangecat.ch";

// Default "from" address for transactional emails — used as fallback when RESEND_FROM is unset.
// Sending from vitareba.ch requires domain verification in Resend: https://resend.com/domains
// Until verified, set RESEND_FROM=onboarding@resend.dev in .env.local for testing.
export const DEFAULT_FROM_EMAIL = `${COMPANY.name} <noreply@vitareba.ch>`;

/**
 * Parse the ADMIN_EMAILS env var into a clean, normalised, deduplicated array.
 * Lowercases every entry so a misconfigured env var like "m@x.com, M@x.com"
 * doesn't double-email the same admin, and stays consistent with the
 * lowercase-on-input policy applied to user records by emailField().
 */
export function getAdminEmails(): string[] {
  const raw = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(raw));
}
