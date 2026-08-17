"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import styles from "@/app/(admin)/admin.module.css";
import { BADGE_MAX_COUNT } from "@/lib/config/portal";
import {
  ADMIN_ROUTES,
  ADMIN_ROUTE_LABELS,
  ADMIN_ROUTE_SHORT_LABELS,
  ADMIN_NAV_GROUPS,
  ADMIN_BOTTOM_NAV,
  type AdminRoute,
} from "@/lib/config/routes";

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const IcoToday = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="1.5" width="5" height="5" rx="1"/>
    <rect x="9.5" y="1.5" width="5" height="5" rx="1"/>
    <rect x="1.5" y="9.5" width="5" height="5" rx="1"/>
    <rect x="9.5" y="9.5" width="5" height="5" rx="1"/>
  </svg>
);

const IcoPatients = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="5.5" cy="5" r="2.25"/>
    <path d="M1.5 14c0-2.5 1.8-4.5 4-4.5s4 2 4 4.5"/>
    <circle cx="11.5" cy="4.5" r="1.75"/>
    <path d="M9.5 9.2c1.9.15 3.5 1.9 3.5 4.3"/>
  </svg>
);

const IcoBookings = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="3.5" width="13" height="11" rx="1.5"/>
    <line x1="1.5" y1="7.5" x2="14.5" y2="7.5"/>
    <line x1="5" y1="1.5" x2="5" y2="5.5"/>
    <line x1="11" y1="1.5" x2="11" y2="5.5"/>
  </svg>
);

const IcoMessages = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 2h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H5.5l-3 2.5V3a1 1 0 0 1 1-1z"/>
  </svg>
);

const IcoDocuments = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5L9.5 1.5z"/>
    <polyline points="9.5,1.5 9.5,5.5 13.5,5.5"/>
    <line x1="5" y1="8.5" x2="11" y2="8.5"/>
    <line x1="5" y1="11" x2="8.5" y2="11"/>
  </svg>
);

const IcoApplications = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 9.5 4 3.5a1 1 0 0 1 .9-.6h6.2a1 1 0 0 1 .9.6l2.5 6"/>
    <path d="M1.5 9.5v3a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3h-3.3a2 2 0 0 1-1.9 1.4H6.7a2 2 0 0 1-1.9-1.4H1.5z"/>
  </svg>
);

const IcoReports = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1.5" y1="14" x2="14.5" y2="14"/>
    <rect x="3" y="8.5" width="2.5" height="5.5" rx="0.5"/>
    <rect x="6.75" y="5.5" width="2.5" height="8.5" rx="0.5"/>
    <rect x="10.5" y="2.5" width="2.5" height="11.5" rx="0.5"/>
  </svg>
);

const IcoProfile = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="5.5" r="3"/>
    <path d="M1.5 14.5c0-3.3 2.9-6 6.5-6s6.5 2.7 6.5 6"/>
  </svg>
);

const IcoMore = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="3" cy="8" r="1.1" fill="currentColor" stroke="none"/>
    <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none"/>
    <circle cx="13" cy="8" r="1.1" fill="currentColor" stroke="none"/>
  </svg>
);

/**
 * Icon per route — same exhaustive-typing discipline as PortalNav's
 * ROUTE_ICONS (see its comment): keyed by AdminRoute, not string, so a new
 * admin route with no icon entry is a compile error, not `<undefined />`
 * taking down the whole admin layout.
 */
const ROUTE_ICONS: Record<AdminRoute, React.ComponentType> = {
  [ADMIN_ROUTES.root]:         IcoToday,
  [ADMIN_ROUTES.patients]:     IcoPatients,
  [ADMIN_ROUTES.bookings]:     IcoBookings,
  [ADMIN_ROUTES.messages]:     IcoMessages,
  [ADMIN_ROUTES.documents]:    IcoDocuments,
  [ADMIN_ROUTES.applications]: IcoApplications,
  [ADMIN_ROUTES.reports]:      IcoReports,
  [ADMIN_ROUTES.profile]:      IcoProfile,
};

type BadgeKey = "messages" | "bookings" | "patients" | "applications";

const ROUTE_BADGE_KEYS: Partial<Record<AdminRoute, BadgeKey>> = {
  [ADMIN_ROUTES.messages]:     "messages",
  [ADMIN_ROUTES.bookings]:     "bookings",
  [ADMIN_ROUTES.patients]:     "patients",
  [ADMIN_ROUTES.applications]: "applications",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isActive(pathname: string, href: string): boolean {
  // The root is a page, not a prefix. Without this exception every admin URL
  // starts with "/admin/" and "Today" would light up on all of them.
  if (href === ADMIN_ROUTES.root) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export type AdminBadgeProps = {
  unreadMessages?: number;
  newBookings?: number;
  urgentPatients?: number;
  pendingApplications?: number;
};

function badgeCount(href: AdminRoute, badges: Record<BadgeKey, number>): number {
  const key = ROUTE_BADGE_KEYS[href];
  return key ? badges[key] : 0;
}

function useBadges(props: AdminBadgeProps) {
  const pathname = usePathname();
  return {
    pathname,
    badges: {
      messages: props.unreadMessages ?? 0,
      bookings: props.newBookings ?? 0,
      patients: props.urgentPatients ?? 0,
      applications: props.pendingApplications ?? 0,
    },
  };
}

// ─── Sidebar nav (desktop) ────────────────────────────────────────────────────

export function AdminNav(props: AdminBadgeProps) {
  const { pathname, badges } = useBadges(props);

  return (
    <nav className={styles.nav} aria-label="Admin navigation">
      {ADMIN_NAV_GROUPS.map((group, gi) => (
        <div key={gi} className={styles.navGroup}>
          {group.label && <div className={styles.navGroupLabel}>{group.label}</div>}
          {group.routes.map((href) => {
            const Icon = ROUTE_ICONS[href];
            const active = isActive(pathname, href);
            const count = badgeCount(href, badges);
            const urgent = ROUTE_BADGE_KEYS[href] === "patients";
            return (
              <Link
                key={href}
                href={href}
                className={active ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
                aria-current={active ? "page" : undefined}
              >
                <span className={styles.navIcon}><Icon /></span>
                <span className={styles.navLabel}>{ADMIN_ROUTE_LABELS[href]}</span>
                {count > 0 && (
                  <span
                    className={urgent ? styles.navBadgeUrgent : styles.navBadge}
                    aria-label={urgent ? `${count} patients need attention` : `${count} new`}
                  >
                    {count > BADGE_MAX_COUNT ? `${BADGE_MAX_COUNT}+` : count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

// ─── Mobile bottom tab bar ────────────────────────────────────────────────────
//
// ADMIN_BOTTOM_NAV covers only the 4 most-used destinations — Today, Patients,
// Bookings, Messages — because a thumb-reachable bar does not fit admin's 8
// destinations the way it fits the portal's 5. Everything else (Documents,
// Applications, Reports, My Profile) lives behind "More", a bottom sheet
// listing the remaining ADMIN_NAV_GROUPS routes. This mirrors the portal's
// BottomNav on purpose: a clinician who is also a patient (the dual-role
// "Clinician area ↔ Patient portal" switch) should not relearn navigation —
// bottom tabs on both sides, not a bottom bar on one and a drawer on the other.

function otherRoutes(): AdminRoute[] {
  const primary = new Set<AdminRoute>(ADMIN_BOTTOM_NAV);
  return ADMIN_NAV_GROUPS.flatMap((g) => g.routes).filter((r) => !primary.has(r));
}

export function AdminBottomNav(props: AdminBadgeProps) {
  const { pathname, badges } = useBadges(props);
  const [moreOpen, setMoreOpen] = useState(false);
  const rest = otherRoutes();
  const moreHasBadge = rest.some((href) => badgeCount(href, badges) > 0);

  return (
    <>
      <nav className={styles.bottomNav} aria-label="Mobile admin navigation">
        {ADMIN_BOTTOM_NAV.map((href) => {
          const Icon = ROUTE_ICONS[href];
          const active = isActive(pathname, href);
          const count = badgeCount(href, badges);
          return (
            <Link
              key={href}
              href={href}
              className={active ? `${styles.bottomNavItem} ${styles.bottomNavItemActive}` : styles.bottomNavItem}
              aria-current={active ? "page" : undefined}
              onClick={() => setMoreOpen(false)}
            >
              <span className={styles.bottomNavIcon}>
                <Icon />
                {count > 0 && (
                  <span className={styles.bottomNavBadge} aria-label={`${count} new`}>
                    {count > BADGE_MAX_COUNT ? `${BADGE_MAX_COUNT}+` : count}
                  </span>
                )}
              </span>
              <span className={styles.bottomNavLabel}>
                {ADMIN_ROUTE_SHORT_LABELS[href] ?? ADMIN_ROUTE_LABELS[href]}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          className={styles.bottomNavItem}
          aria-expanded={moreOpen}
          aria-controls="admin-more-sheet"
          onClick={() => setMoreOpen((o) => !o)}
        >
          <span className={styles.bottomNavIcon}>
            <IcoMore />
            {moreHasBadge && <span className={styles.bottomNavBadge} aria-label="New items" />}
          </span>
          <span className={styles.bottomNavLabel}>More</span>
        </button>
      </nav>

      {moreOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className={styles.moreSheetScrim}
            onClick={() => setMoreOpen(false)}
          />
          <div id="admin-more-sheet" className={styles.moreSheet} role="dialog" aria-label="More">
            {rest.map((href) => {
              const Icon = ROUTE_ICONS[href];
              const count = badgeCount(href, badges);
              const urgent = ROUTE_BADGE_KEYS[href] === "patients";
              return (
                <Link
                  key={href}
                  href={href}
                  className={styles.moreSheetItem}
                  onClick={() => setMoreOpen(false)}
                >
                  <span className={styles.navIcon}><Icon /></span>
                  <span className={styles.navLabel}>{ADMIN_ROUTE_LABELS[href]}</span>
                  {count > 0 && (
                    <span className={urgent ? styles.navBadgeUrgent : styles.navBadge}>
                      {count > BADGE_MAX_COUNT ? `${BADGE_MAX_COUNT}+` : count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
