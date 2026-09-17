"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import styles from "@/app/(admin)/admin.module.css";
import {
  NavSidebar,
  NavBottomBar,
  isActive,
  badgeText,
  type NavEntry,
} from "@/components/nav/NavSurfaces";
import {
  IcoGrid,
  IcoPeople,
  IcoCalendar,
  IcoChat,
  IcoDoc,
  IcoTray,
  IcoBars,
  IcoPerson,
  IcoMore,
} from "@/components/nav/icons";
import {
  ADMIN_ROUTES,
  ADMIN_ROUTE_LABELS,
  ADMIN_ROUTE_SHORT_LABELS,
  ADMIN_NAV_GROUPS,
  ADMIN_BOTTOM_NAV,
  type AdminRoute,
} from "@/lib/config/routes";

/**
 * Icon per route — same exhaustive-typing discipline as PortalNav's
 * ROUTE_ICONS (see its comment): keyed by AdminRoute, not string, so a new
 * admin route with no icon entry is a compile error, not `<undefined />`
 * taking down the whole admin layout. The glyphs themselves are shared with
 * the portal in components/nav/icons.tsx.
 */
const ROUTE_ICONS: Record<AdminRoute, React.ComponentType> = {
  [ADMIN_ROUTES.root]: IcoGrid,
  [ADMIN_ROUTES.patients]: IcoPeople,
  [ADMIN_ROUTES.bookings]: IcoCalendar,
  [ADMIN_ROUTES.messages]: IcoChat,
  [ADMIN_ROUTES.documents]: IcoDoc,
  [ADMIN_ROUTES.applications]: IcoTray,
  [ADMIN_ROUTES.reports]: IcoBars,
  [ADMIN_ROUTES.profile]: IcoPerson,
};

type BadgeKey = "messages" | "bookings" | "patients";

const ROUTE_BADGE_KEYS: Partial<Record<AdminRoute, BadgeKey>> = {
  [ADMIN_ROUTES.messages]: "messages",
  [ADMIN_ROUTES.bookings]: "bookings",
  [ADMIN_ROUTES.patients]: "patients",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export type AdminBadgeProps = {
  unreadMessages?: number;
  newBookings?: number;
  urgentPatients?: number;
};

type Badges = Record<BadgeKey, number>;

function badgeCount(href: AdminRoute, badges: Badges): number {
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
    },
  };
}

/**
 * Route → what the shared nav renders.
 *
 * The sidebar can afford to say what an urgent count MEANS ("3 patients need
 * attention", in the urgent colour); the bottom bar has room for a dot and a
 * number, so it announces the plain "3 new" there. That is the only real
 * difference between the two surfaces, and it lives here rather than in two
 * copies of the markup.
 */
function entries(
  routes: readonly AdminRoute[],
  pathname: string,
  badges: Badges,
  variant: "sidebar" | "bottom",
): NavEntry[] {
  return routes.map((href) => {
    const count = badgeCount(href, badges);
    const urgent = ROUTE_BADGE_KEYS[href] === "patients";
    const sidebar = variant === "sidebar";
    return {
      href,
      label: sidebar
        ? ADMIN_ROUTE_LABELS[href]
        : (ADMIN_ROUTE_SHORT_LABELS[href] ?? ADMIN_ROUTE_LABELS[href]),
      Icon: ROUTE_ICONS[href],
      active: isActive(pathname, href, ADMIN_ROUTES.root),
      badge:
        count > 0
          ? {
              text: badgeText(count),
              className: sidebar && urgent ? styles.navBadgeUrgent : styles.navBadge,
              ariaLabel: sidebar && urgent ? `${count} patients need attention` : `${count} new`,
            }
          : null,
    };
  });
}

// ─── Sidebar nav (desktop) ────────────────────────────────────────────────────

export function AdminNav(props: AdminBadgeProps) {
  const { pathname, badges } = useBadges(props);

  return (
    <NavSidebar
      styles={styles}
      ariaLabel="Admin navigation"
      groups={ADMIN_NAV_GROUPS.map((group) => ({
        label: group.label,
        items: entries(group.routes, pathname, badges, "sidebar"),
      }))}
    />
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
      <NavBottomBar
        styles={styles}
        ariaLabel="Mobile admin navigation"
        items={entries(ADMIN_BOTTOM_NAV, pathname, badges, "bottom")}
        onNavigate={() => setMoreOpen(false)}
      >
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
      </NavBottomBar>

      {moreOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className={styles.moreSheetScrim}
            onClick={() => setMoreOpen(false)}
          />
          <div id="admin-more-sheet" className={styles.moreSheet} role="dialog" aria-label="More">
            {entries(rest, pathname, badges, "sidebar").map((item) => (
              // The sidebar and the bottom bar both announce the current page.
              // The overflow sheet did not — so the destinations that happened
              // to land behind "More" were the ones a screen-reader user could
              // not locate themselves in. It reuses the sidebar's entries so
              // that stays true of all three surfaces at once.
              <Link
                key={item.href}
                href={item.href}
                className={styles.moreSheetItem}
                aria-current={item.active ? "page" : undefined}
                onClick={() => setMoreOpen(false)}
              >
                <span className={styles.navIcon}>
                  <item.Icon />
                </span>
                <span className={styles.navLabel}>{item.label}</span>
                {item.badge && <span className={item.badge.className}>{item.badge.text}</span>}
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
