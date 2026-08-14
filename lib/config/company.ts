export const COMPANY = {
  name: "VitaReBa GmbH",
  shortName: "VitaReBa",
  /**
   * How to refer to a patient's doctor when we do NOT know who it is — before
   * a care team exists, or in copy addressed to no one in particular.
   *
   * There is deliberately no `clinicianName` here. Who treats a given patient
   * is answered by `care_team` (lib/domain/care-team.ts); naming one doctor in
   * config made every email tell every patient the same name, which stopped
   * being true the moment the clinic had two. Resolve the real name with
   * `clinicianLabelFor(patientId)` and fall back to this.
   *
   * Lowercase on purpose — it appears mid-sentence more often than not. Use
   * `sentenceCase()` where it starts a sentence.
   */
  clinicianFallback: "your clinician",
  partnerBrand: "Surf Your Life",
  email: "manuel@surfyourlife.org",
  address: {
    street: "Zollikerstrasse 183",
    zip: "8008",
    city: "Zürich",
  },
  foundingYear: 2026,
} as const;

/**
 * The clinic's IANA timezone — SSOT for every "what day is it?" decision.
 * Check-in day boundaries, streaks and cron date windows all use this, so a
 * patient checking in at 00:30 Zürich time (22:30 UTC) lands on the correct
 * calendar day regardless of server or device timezone.
 */
export const CLINIC_TIMEZONE = "Europe/Zurich";

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
