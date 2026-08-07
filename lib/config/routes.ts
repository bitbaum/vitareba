// Route path constants — SSOT for all portal, admin, and auth URL paths
// Adding a new portal route: update here + middleware.ts PORTAL_PREFIXES

export const AUTH_ROUTES = {
  login:          "/login",
  register:       "/register",
  forgotPassword: "/forgot-password",
  resetPassword:  "/reset-password",
} as const satisfies Record<string, string>;

export const PORTAL_ROUTES = {
  dashboard:   "/dashboard",
  checkin:     "/checkin",
  assessment:  "/assessment",
  assessments: "/assessments",
  goals:       "/goals",
  bookings:    "/bookings",
  messages:    "/messages",
  documents:   "/documents",
  profile:     "/profile",
} as const satisfies Record<string, string>;

/**
 * Display label for every portal route — consumed by PortalNav AND
 * NavBreadcrumb. Keyed off PORTAL_ROUTES so a new route without a label is a
 * type error, not a silently blank breadcrumb.
 */
export const PORTAL_ROUTE_LABELS: Record<
  (typeof PORTAL_ROUTES)[keyof typeof PORTAL_ROUTES],
  string
> = {
  [PORTAL_ROUTES.dashboard]:   "Dashboard",
  [PORTAL_ROUTES.checkin]:     "Daily Check-in",
  [PORTAL_ROUTES.assessment]:  "Assessment",
  [PORTAL_ROUTES.assessments]: "My Results",
  [PORTAL_ROUTES.goals]:       "My Goals",
  [PORTAL_ROUTES.bookings]:    "Bookings",
  [PORTAL_ROUTES.messages]:    "Messages",
  [PORTAL_ROUTES.documents]:   "Documents",
  [PORTAL_ROUTES.profile]:     "Profile",
};

/**
 * API prefixes that must be reachable WITHOUT a session — the middleware
 * exempts these from its auth gate. Each route authenticates itself:
 * /api/auth via NextAuth + per-route guards, /api/webhooks via signature,
 * /api/cron via CRON_SECRET bearer, the rest via Zod validation (no PII
 * without auth). Gating these in the middleware breaks login itself —
 * the session endpoint and credentials callback live under /api/auth.
 */
export const PUBLIC_API_PREFIXES = [
  "/api/auth",
  "/api/account",
  "/api/assessment-leads",
  "/api/webhooks",
  "/api/cron",
  "/api/health",
] as const satisfies readonly string[];

export const ADMIN_ROUTES = {
  root:      "/admin",
  patients:  "/admin/patients",
  bookings:  "/admin/bookings",
  messages:  "/admin/messages",
  documents: "/admin/documents",
  reports:   "/admin/reports",
} as const satisfies Record<string, string>;

/**
 * Request header set by proxy.ts middleware containing the URL-derived locale.
 * Read by app/layout.tsx so <html lang> reflects the actual URL — not a cookie
 * (which crawlers don't carry, breaking SEO for non-default locales).
 */
export const LOCALE_HEADER = "x-vita-locale";
