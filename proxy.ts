import { auth } from "@/lib/auth/edge";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextResponse } from "next/server";
import { USER_ROLE } from "@/lib/config/auth";
import {
  PORTAL_ROUTES,
  ADMIN_ROUTES,
  AUTH_ROUTES,
  PUBLIC_API_PREFIXES,
  LOCALE_HEADER,
} from "@/lib/config/routes";

const intlMiddleware = createIntlMiddleware(routing);

// Portal / admin paths: auth-guard only, bypass locale routing.
// Derived from PORTAL_ROUTES so adding a new portal route only requires
// updating lib/config/routes.ts — not this file too.
const PORTAL_PREFIXES = [
  ...Object.values(PORTAL_ROUTES),
  "/admin", // all admin sub-routes share this prefix
  "/api",
];

// Auth paths as they appear under a locale prefix (e.g. /de/login)
// Derived from AUTH_ROUTES so adding a new auth page only requires updating lib/config/routes.ts
const LOCALE_AUTH_SUFFIXES = Object.values(AUTH_ROUTES);

/** Extract a routing locale from the URL pathname; falls back to the default locale. */
function detectLocale(pathname: string): string {
  const seg = pathname.split("/")[1];
  return (routing.locales as readonly string[]).includes(seg) ? seg : routing.defaultLocale;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const dest =
    session?.user.role === USER_ROLE.admin ? ADMIN_ROUTES.patients : PORTAL_ROUTES.dashboard;

  // Inject URL-derived locale as a request header so the root layout can set
  // <html lang> from the actual URL (not from a cookie that crawlers don't carry).
  const locale = detectLocale(pathname);
  req.headers.set(LOCALE_HEADER, locale);
  const passThrough = () => NextResponse.next({ request: { headers: req.headers } });

  // Public API surface (auth endpoints, registration, webhooks, cron, health):
  // each of these routes authenticates itself — the session gate must not
  // cover them, or login/registration break (the NextAuth session + callback
  // endpoints live under /api/auth).
  if (PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return passThrough();
  }

  // ── Portal / admin ─────────────────────────────────────────────────────
  if (PORTAL_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (!session) {
      // API calls come from fetch() — an HTML login page is not an answer.
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
      const loginUrl = new URL(AUTH_ROUTES.login, req.url);
      loginUrl.searchParams.set("returnTo", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (pathname.startsWith(ADMIN_ROUTES.root) && session.user.role !== USER_ROLE.admin) {
      return NextResponse.redirect(new URL(PORTAL_ROUTES.dashboard, req.url));
    }
    // NOTE: admins are NOT redirected away from the patient portal — dual-role
    // clinicians (Manuel, George) are patients too and use both areas. The
    // post-login "admins land in admin" default lives in the login page.
    return passThrough();
  }

  // ── Locale-prefixed portal paths: redirect to canonical ───────────────
  // e.g. /en/dashboard → /dashboard, /de/profile → /profile
  const localePortalMatch = routing.locales
    .flatMap((locale) => PORTAL_PREFIXES.map((p) => ({ locale, prefix: p })))
    .find(
      ({ locale, prefix }) =>
        pathname === `/${locale}${prefix}` || pathname.startsWith(`/${locale}${prefix}/`),
    );
  if (localePortalMatch) {
    const stripped = pathname.slice(localePortalMatch.locale.length + 1); // remove /locale
    return NextResponse.redirect(new URL(stripped, req.url));
  }

  // ── Marketing / auth: locale routing ───────────────────────────────────

  // Redirect logged-in users away from locale-prefixed auth pages
  const isLocaleAuthPath = LOCALE_AUTH_SUFFIXES.some((suffix) =>
    routing.locales.some(
      (locale) => pathname === `/${locale}${suffix}` || pathname.startsWith(`/${locale}${suffix}/`),
    ),
  );
  if (session && isLocaleAuthPath) {
    return NextResponse.redirect(new URL(dest, req.url));
  }

  // Delegate to next-intl, then ensure our LOCALE_HEADER reaches downstream
  // rendering by re-emitting the response with the modified request headers.
  // (intl's NextResponse.next/rewrite doesn't include our request.headers init.)
  const intlResp = intlMiddleware(req);
  const rewriteUrl = intlResp.headers.get("x-middleware-rewrite");
  const redirectUrl = intlResp.headers.get("location");
  if (redirectUrl) return intlResp; // redirects don't render the layout
  const wrapped = rewriteUrl
    ? NextResponse.rewrite(rewriteUrl, { request: { headers: req.headers } })
    : NextResponse.next({ request: { headers: req.headers } });
  intlResp.headers.forEach((v, k) => {
    if (k !== "x-middleware-rewrite" && k !== "location") wrapped.headers.set(k, v);
  });
  return wrapped;
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon|icon|opengraph-image|robots\\.txt|sitemap\\.xml|.*\\..*).*)",
  ],
};
