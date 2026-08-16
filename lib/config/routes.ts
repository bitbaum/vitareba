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
  labs:        "/labs",
  goals:       "/goals",
  bookings:    "/bookings",
  messages:    "/messages",
  documents:   "/documents",
  profile:     "/profile",
  regulation:  "/regulation",
} as const satisfies Record<string, string>;

/**
 * The only way to fetch a document's bytes. Never link to documents.fileUrl
 * directly: that is a storage location, not an authorised URL, and linking it
 * puts a patient's medical file on the open web.
 */
export const documentFileUrl = (id: string): string => `/api/documents/${id}/file`;

/**
 * Every portal path, as a union. Anything that must have an entry PER ROUTE —
 * a label, an icon — keys off this so a new route without one is a compile
 * error. A `Record<string, …>` promises a value for keys it does not have, and
 * a nav icon looked up that way renders `<undefined />`, which takes down the
 * whole portal layout.
 */
export type PortalRoute = (typeof PORTAL_ROUTES)[keyof typeof PORTAL_ROUTES];

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
  [PORTAL_ROUTES.labs]:        "Labs & Vitals",
  [PORTAL_ROUTES.goals]:       "My Goals",
  [PORTAL_ROUTES.bookings]:    "Bookings",
  [PORTAL_ROUTES.messages]:    "Messages",
  [PORTAL_ROUTES.documents]:   "Documents",
  [PORTAL_ROUTES.profile]:     "Profile",
  [PORTAL_ROUTES.regulation]:  "Regulation",
};

/**
 * Portal navigation structure — SSOT for BOTH the desktop sidebar and the
 * mobile bottom tab bar (PortalNav renders both from this). Labels come from
 * PORTAL_ROUTE_LABELS; shortLabel overrides only where the full label doesn't
 * fit a bottom-bar tab.
 */
export const PORTAL_NAV_GROUPS: {
  label: string | null;
  routes: (typeof PORTAL_ROUTES)[keyof typeof PORTAL_ROUTES][];
}[] = [
  { label: null,      routes: [PORTAL_ROUTES.dashboard] },
  { label: "Track",   routes: [PORTAL_ROUTES.checkin, PORTAL_ROUTES.assessment, PORTAL_ROUTES.assessments, PORTAL_ROUTES.labs, PORTAL_ROUTES.goals] },
  { label: "Care",    routes: [PORTAL_ROUTES.bookings, PORTAL_ROUTES.messages, PORTAL_ROUTES.documents] },
  { label: "Account", routes: [PORTAL_ROUTES.profile] },
];

export const PORTAL_BOTTOM_NAV: (typeof PORTAL_ROUTES)[keyof typeof PORTAL_ROUTES][] = [
  PORTAL_ROUTES.dashboard,
  PORTAL_ROUTES.checkin,
  PORTAL_ROUTES.messages,
  PORTAL_ROUTES.bookings,
  PORTAL_ROUTES.documents,
];

/** Bottom-bar tab labels where the full PORTAL_ROUTE_LABELS entry is too long. */
export const PORTAL_ROUTE_SHORT_LABELS: Partial<
  Record<(typeof PORTAL_ROUTES)[keyof typeof PORTAL_ROUTES], string>
> = {
  [PORTAL_ROUTES.dashboard]: "Home",
  [PORTAL_ROUTES.checkin]:   "Check-in",
  [PORTAL_ROUTES.labs]:      "Labs",
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
  // Calendar clients (Google/Apple/Outlook) poll a URL forever and never send
  // cookies — a session gate here means the feed simply never works. Routes
  // under this prefix authenticate themselves (HMAC token, or requireSession),
  // which route-auth-invariant.test.ts enforces.
  "/api/calendar",
] as const satisfies readonly string[];

export const ADMIN_ROUTES = {
  root:      "/admin",
  patients:  "/admin/patients",
  bookings:  "/admin/bookings",
  messages:  "/admin/messages",
  documents: "/admin/documents",
  reports:   "/admin/reports",
} as const satisfies Record<string, string>;

/** Display label per admin route — consumed by NavBreadcrumb (same contract as PORTAL_ROUTE_LABELS). */
export const ADMIN_ROUTE_LABELS: Record<
  (typeof ADMIN_ROUTES)[keyof typeof ADMIN_ROUTES],
  string
> = {
  [ADMIN_ROUTES.root]:      "Today",
  [ADMIN_ROUTES.patients]:  "Patients",
  [ADMIN_ROUTES.bookings]:  "Bookings",
  [ADMIN_ROUTES.messages]:  "Messages",
  [ADMIN_ROUTES.documents]: "Documents",
  [ADMIN_ROUTES.reports]:   "Reports",
};

/**
 * Request header set by proxy.ts middleware containing the URL-derived locale.
 * Read by app/layout.tsx so <html lang> reflects the actual URL — not a cookie
 * (which crawlers don't carry, breaking SEO for non-default locales).
 */
export const LOCALE_HEADER = "x-vita-locale";
