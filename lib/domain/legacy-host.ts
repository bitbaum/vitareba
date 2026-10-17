import { CANONICAL_HOST, LEGACY_HOSTS } from "@/lib/config/company";

/**
 * Where a request on a retired host should go, or null to serve it here.
 *
 * Pages move to the canonical host with a 308. /api/* is never moved: cron
 * timers call it without following redirects, subscribed calendars poll it,
 * and the auth callbacks must answer on the host that set the cookie.
 */
export function legacyHostRedirect(
  host: string | null,
  pathname: string,
  search = "",
): string | null {
  const bare = (host ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  if (!LEGACY_HOSTS.includes(bare)) return null;
  if (pathname === "/api" || pathname.startsWith("/api/")) return null;
  return `https://${CANONICAL_HOST}${pathname}${search}`;
}
