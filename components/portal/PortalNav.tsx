"use client";

import { usePathname } from "next/navigation";
import styles from "@/app/(portal)/portal.module.css";
import {
  NavSidebar,
  NavBottomBar,
  isActive,
  badgeText,
  type NavEntry,
} from "@/components/nav/NavSurfaces";
import {
  IcoGrid,
  IcoTrend,
  IcoClipboard,
  IcoBars,
  IcoFlask,
  IcoTarget,
  IcoPeople,
  IcoCalendar,
  IcoChat,
  IcoDoc,
  IcoPerson,
} from "@/components/nav/icons";
import {
  PORTAL_ROUTES,
  PORTAL_ROUTE_LABELS,
  PORTAL_ROUTE_SHORT_LABELS,
  PORTAL_NAV_GROUPS,
  PORTAL_BOTTOM_NAV,
  type PortalRoute,
} from "@/lib/config/routes";

/**
 * Icon per route — presentation only; nav STRUCTURE lives in
 * lib/config/routes.ts (PORTAL_NAV_GROUPS / PORTAL_BOTTOM_NAV) and the glyphs
 * in components/nav/icons.tsx.
 *
 * KEYED BY PortalRoute, NOT string, and that is the whole point. It was
 * `Record<string, ComponentType>`, which accepts any key and therefore promises
 * a component for keys it does not have. Adding /labs to the nav compiled
 * perfectly, looked up an icon that was not there, and rendered `<undefined />`
 * — which React answers with "Element type is invalid". PortalNav is in the
 * portal LAYOUT, so that one missing entry took down every page in the patient
 * portal at once: dashboard, check-in, messages, bookings, all of it.
 *
 * With an exhaustive Record the same mistake is a compile error, and CI catches
 * it before anyone's portal does.
 */
const ROUTE_ICONS: Record<PortalRoute, React.ComponentType> = {
  [PORTAL_ROUTES.dashboard]: IcoGrid,
  [PORTAL_ROUTES.checkin]: IcoTrend,
  [PORTAL_ROUTES.assessment]: IcoClipboard,
  [PORTAL_ROUTES.assessments]: IcoBars,
  [PORTAL_ROUTES.labs]: IcoFlask,
  [PORTAL_ROUTES.goals]: IcoTarget,
  [PORTAL_ROUTES.careTeam]: IcoPeople,
  [PORTAL_ROUTES.bookings]: IcoCalendar,
  [PORTAL_ROUTES.messages]: IcoChat,
  [PORTAL_ROUTES.documents]: IcoDoc,
  [PORTAL_ROUTES.profile]: IcoPerson,
  [PORTAL_ROUTES.regulation]: IcoDoc,
};

/**
 * Routes that carry a live badge count. Genuinely PARTIAL — most routes have no
 * badge — and typed as Partial so that is a stated fact rather than the same
 * loose `string` key that hid the missing icon.
 */
const ROUTE_BADGE_KEYS: Partial<Record<PortalRoute, "messages" | "goals">> = {
  [PORTAL_ROUTES.messages]: "messages",
  [PORTAL_ROUTES.goals]: "goals",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type BadgeProps = { unreadMessages?: number; hasTodayCheckin?: boolean; newGoals?: number };
type Badges = { messages: number; goals: number };

function useBadges({ unreadMessages = 0, newGoals = 0 }: BadgeProps) {
  const pathname = usePathname();
  // Suppress goals badge when the patient is already viewing the goals page
  const goalsOnPage = pathname === PORTAL_ROUTES.goals;
  return { pathname, badges: { messages: unreadMessages, goals: goalsOnPage ? 0 : newGoals } };
}

function badgeCount(href: PortalRoute, badges: Badges): number {
  const key = ROUTE_BADGE_KEYS[href];
  return key ? badges[key] : 0;
}

/**
 * Route → what the shared nav renders. `short` selects the bottom-bar label and
 * the bottom-bar variant of the check-in dot — the portal's own marker for "you
 * have not checked in today", which has no equivalent on the admin side.
 */
function entries(
  routes: readonly PortalRoute[],
  pathname: string,
  badges: Badges,
  hasTodayCheckin: boolean,
  opts: { short: boolean; badgeClassName: string },
): NavEntry[] {
  return routes.map((href) => {
    const active = isActive(pathname, href, PORTAL_ROUTES.dashboard);
    const count = badgeCount(href, badges);
    const showCheckinDot = href === PORTAL_ROUTES.checkin && !hasTodayCheckin && !active;
    return {
      href,
      label: opts.short
        ? (PORTAL_ROUTE_SHORT_LABELS[href] ?? PORTAL_ROUTE_LABELS[href])
        : PORTAL_ROUTE_LABELS[href],
      Icon: ROUTE_ICONS[href],
      active,
      badge:
        count > 0
          ? { text: badgeText(count), className: opts.badgeClassName, ariaLabel: `${count} unread` }
          : null,
      dot: showCheckinDot
        ? {
            className: opts.short ? styles.bottomNavCheckinDot : styles.navCheckinDot,
            ariaLabel: "Check in today",
          }
        : null,
    };
  });
}

// ─── Sidebar nav (desktop) ────────────────────────────────────────────────────

export function PortalNav(props: BadgeProps) {
  const { pathname, badges } = useBadges(props);
  const hasTodayCheckin = props.hasTodayCheckin ?? true;

  return (
    <NavSidebar
      styles={styles}
      ariaLabel="Portal navigation"
      groups={PORTAL_NAV_GROUPS.map((group) => ({
        label: group.label,
        items: entries(group.routes, pathname, badges, hasTodayCheckin, {
          short: false,
          badgeClassName: styles.navBadge,
        }),
      }))}
    />
  );
}

// ─── Mobile bottom tab bar ────────────────────────────────────────────────────

export function BottomNav(props: BadgeProps) {
  const { pathname, badges } = useBadges(props);
  const hasTodayCheckin = props.hasTodayCheckin ?? true;

  return (
    <NavBottomBar
      styles={styles}
      ariaLabel="Mobile navigation"
      items={entries(PORTAL_BOTTOM_NAV, pathname, badges, hasTodayCheckin, {
        short: true,
        badgeClassName: styles.bottomNavBadge,
      })}
    />
  );
}
