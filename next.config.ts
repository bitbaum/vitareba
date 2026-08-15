import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * Baseline security headers. This app serves health data behind a login, so the
 * defaults matter: without them the portal can be framed by any site
 * (clickjacking a "confirm booking" click), and full portal URLs leak to third
 * parties through the Referer header.
 *
 * Deliberately NOT a full Content-Security-Policy — script-src for Next's
 * inline bootstrap needs nonce plumbing, and a broken CSP silently breaks the
 * app. frame-ancestors is the part that carries real risk here, and it is
 * enforceable on its own.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // 2 years, subdomains included. The site is HTTPS-only behind Caddy already.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg"],
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  // Sourcemap upload is optional: only runs when SENTRY_AUTH_TOKEN is set.
  // Build must always pass without any Sentry credentials.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  silent: true,
  telemetry: false,
});
