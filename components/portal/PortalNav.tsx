"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import styles from "@/app/(portal)/portal.module.css";
import { BADGE_MAX_COUNT } from "@/lib/config/portal";
import {
  PORTAL_ROUTES,
  PORTAL_ROUTE_LABELS,
  PORTAL_ROUTE_SHORT_LABELS,
  PORTAL_NAV_GROUPS,
  PORTAL_BOTTOM_NAV,
} from "@/lib/config/routes";

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const IcoDashboard = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="1.5" width="5" height="5" rx="1"/>
    <rect x="9.5" y="1.5" width="5" height="5" rx="1"/>
    <rect x="1.5" y="9.5" width="5" height="5" rx="1"/>
    <rect x="9.5" y="9.5" width="5" height="5" rx="1"/>
  </svg>
);

const IcoCheckin = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1.5,9 5,5.5 8,11 11,3.5 14.5,7"/>
  </svg>
);

const IcoAssessment = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5.5 2.5h1a1 1 0 0 1 2 0h1A1.5 1.5 0 0 1 11 4H5A1.5 1.5 0 0 1 5.5 2.5z"/>
    <path d="M4 3.5H3a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V4.5a1 1 0 0 0-1-1h-1"/>
    <line x1="5.5" y1="7" x2="10.5" y2="7"/>
    <line x1="5.5" y1="9.5" x2="8.5" y2="9.5"/>
  </svg>
);

const IcoResults = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1.5" y1="14" x2="14.5" y2="14"/>
    <rect x="3" y="8.5" width="2.5" height="5.5" rx="0.5"/>
    <rect x="6.75" y="5.5" width="2.5" height="8.5" rx="0.5"/>
    <rect x="10.5" y="2.5" width="2.5" height="11.5" rx="0.5"/>
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

const IcoGoals = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6"/>
    <circle cx="8" cy="8" r="2.5"/>
    <line x1="8" y1="1.5" x2="8" y2="2.5"/>
    <line x1="8" y1="13.5" x2="8" y2="14.5"/>
    <line x1="1.5" y1="8" x2="2.5" y2="8"/>
    <line x1="13.5" y1="8" x2="14.5" y2="8"/>
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

const IcoProfile = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="5.5" r="3"/>
    <path d="M1.5 14.5c0-3.3 2.9-6 6.5-6s6.5 2.7 6.5 6"/>
  </svg>
);

// Icon per route — presentation-only mapping; nav STRUCTURE lives in
// lib/config/routes.ts (PORTAL_NAV_GROUPS / PORTAL_BOTTOM_NAV).
const ROUTE_ICONS: Record<string, React.ComponentType> = {
  [PORTAL_ROUTES.dashboard]:   IcoDashboard,
  [PORTAL_ROUTES.checkin]:     IcoCheckin,
  [PORTAL_ROUTES.assessment]:  IcoAssessment,
  [PORTAL_ROUTES.assessments]: IcoResults,
  [PORTAL_ROUTES.goals]:       IcoGoals,
  [PORTAL_ROUTES.bookings]:    IcoBookings,
  [PORTAL_ROUTES.messages]:    IcoMessages,
  [PORTAL_ROUTES.documents]:   IcoDocuments,
  [PORTAL_ROUTES.profile]:     IcoProfile,
};

// Routes that carry a live badge count
const ROUTE_BADGE_KEYS: Record<string, "messages" | "goals"> = {
  [PORTAL_ROUTES.messages]: "messages",
  [PORTAL_ROUTES.goals]:    "goals",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isActive(pathname: string, href: string): boolean {
  if (href === PORTAL_ROUTES.dashboard) return pathname === PORTAL_ROUTES.dashboard;
  return pathname === href || pathname.startsWith(href + "/");
}

type BadgeProps = { unreadMessages?: number; hasTodayCheckin?: boolean; newGoals?: number };

function useBadges({ unreadMessages = 0, newGoals = 0 }: BadgeProps) {
  const pathname = usePathname();
  // Suppress goals badge when the patient is already viewing the goals page
  const goalsOnPage = pathname === PORTAL_ROUTES.goals;
  return { pathname, badges: { messages: unreadMessages, goals: goalsOnPage ? 0 : newGoals } };
}

function badgeCount(href: string, badges: { messages: number; goals: number }): number {
  const key = ROUTE_BADGE_KEYS[href];
  return key ? badges[key] : 0;
}

// ─── Sidebar nav (desktop) ────────────────────────────────────────────────────

export function PortalNav(props: BadgeProps) {
  const { pathname, badges } = useBadges(props);
  const hasTodayCheckin = props.hasTodayCheckin ?? true;

  return (
    <nav className={styles.nav} aria-label="Portal navigation">
      {PORTAL_NAV_GROUPS.map((group, gi) => (
        <div key={gi} className={styles.navGroup}>
          {group.label && <div className={styles.navGroupLabel}>{group.label}</div>}
          {group.routes.map((href) => {
            const Icon = ROUTE_ICONS[href];
            const active = isActive(pathname, href);
            const count = badgeCount(href, badges);
            const showCheckinDot = href === PORTAL_ROUTES.checkin && !hasTodayCheckin && !active;
            return (
              <Link
                key={href}
                href={href}
                className={active ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
                aria-current={active ? "page" : undefined}
              >
                <span className={styles.navIcon}><Icon /></span>
                <span className={styles.navLabel}>{PORTAL_ROUTE_LABELS[href]}</span>
                {count > 0 && (
                  <span className={styles.navBadge} aria-label={`${count} unread`}>
                    {count > BADGE_MAX_COUNT ? `${BADGE_MAX_COUNT}+` : count}
                  </span>
                )}
                {showCheckinDot && (
                  <span className={styles.navCheckinDot} aria-label="Check in today" />
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

export function BottomNav(props: BadgeProps) {
  const { pathname, badges } = useBadges(props);
  const hasTodayCheckin = props.hasTodayCheckin ?? true;

  return (
    <nav className={styles.bottomNav} aria-label="Mobile navigation">
      {PORTAL_BOTTOM_NAV.map((href) => {
        const Icon = ROUTE_ICONS[href];
        const active = isActive(pathname, href);
        const count = badgeCount(href, badges);
        const showCheckinDot = href === PORTAL_ROUTES.checkin && !hasTodayCheckin && !active;
        return (
          <Link
            key={href}
            href={href}
            className={active ? `${styles.bottomNavItem} ${styles.bottomNavItemActive}` : styles.bottomNavItem}
            aria-current={active ? "page" : undefined}
          >
            <span className={styles.bottomNavIcon}>
              <Icon />
              {showCheckinDot && (
                <span className={styles.bottomNavCheckinDot} aria-label="Check in today" />
              )}
              {count > 0 && (
                <span className={styles.bottomNavBadge} aria-label={`${count} unread`}>
                  {count > BADGE_MAX_COUNT ? `${BADGE_MAX_COUNT}+` : count}
                </span>
              )}
            </span>
            <span className={styles.bottomNavLabel}>
              {PORTAL_ROUTE_SHORT_LABELS[href] ?? PORTAL_ROUTE_LABELS[href]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
