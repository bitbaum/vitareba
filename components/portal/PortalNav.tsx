"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import styles from "@/app/(portal)/portal.module.css";
import { BADGE_MAX_COUNT } from "@/lib/config/portal";
import { PORTAL_ROUTES, PORTAL_ROUTE_LABELS } from "@/lib/config/routes";

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

// ─── Nav structure ────────────────────────────────────────────────────────────

type NavItem = {
  href: string;
  label: string;
  Icon: React.ComponentType;
  badgeKey?: "messages" | "goals";
};

const NAV_GROUPS: NavItem[][] = [
  [
    { href: PORTAL_ROUTES.dashboard, label: PORTAL_ROUTE_LABELS[PORTAL_ROUTES.dashboard], Icon: IcoDashboard },
  ],
  [
    { href: PORTAL_ROUTES.checkin, label: PORTAL_ROUTE_LABELS[PORTAL_ROUTES.checkin], Icon: IcoCheckin },
    { href: PORTAL_ROUTES.assessment, label: PORTAL_ROUTE_LABELS[PORTAL_ROUTES.assessment], Icon: IcoAssessment },
    { href: PORTAL_ROUTES.assessments, label: PORTAL_ROUTE_LABELS[PORTAL_ROUTES.assessments], Icon: IcoResults },
    { href: PORTAL_ROUTES.goals, label: PORTAL_ROUTE_LABELS[PORTAL_ROUTES.goals], Icon: IcoGoals, badgeKey: "goals" },
  ],
  [
    { href: PORTAL_ROUTES.bookings, label: PORTAL_ROUTE_LABELS[PORTAL_ROUTES.bookings], Icon: IcoBookings },
    { href: PORTAL_ROUTES.messages, label: PORTAL_ROUTE_LABELS[PORTAL_ROUTES.messages], badgeKey: "messages", Icon: IcoMessages },
    { href: PORTAL_ROUTES.documents, label: PORTAL_ROUTE_LABELS[PORTAL_ROUTES.documents], Icon: IcoDocuments },
  ],
  [
    { href: PORTAL_ROUTES.profile, label: PORTAL_ROUTE_LABELS[PORTAL_ROUTES.profile], Icon: IcoProfile },
  ],
];

const BOTTOM_ITEMS: NavItem[] = [
  { href: PORTAL_ROUTES.dashboard, label: "Home",      Icon: IcoDashboard },
  { href: PORTAL_ROUTES.checkin,   label: "Check-in",  Icon: IcoCheckin },
  { href: PORTAL_ROUTES.messages,  label: "Messages",  badgeKey: "messages", Icon: IcoMessages },
  { href: PORTAL_ROUTES.bookings,  label: "Bookings",  Icon: IcoBookings },
  { href: PORTAL_ROUTES.documents, label: "Documents", Icon: IcoDocuments },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isActive(pathname: string, href: string): boolean {
  if (href === PORTAL_ROUTES.dashboard) return pathname === PORTAL_ROUTES.dashboard;
  return pathname === href || pathname.startsWith(href + "/");
}

type Badges = { messages: number; goals: number };

// ─── Sidebar nav (desktop) ────────────────────────────────────────────────────

export function PortalNav({ unreadMessages = 0, hasTodayCheckin = true, newGoals = 0 }: { unreadMessages?: number; hasTodayCheckin?: boolean; newGoals?: number }) {
  const pathname = usePathname();
  // Suppress goals badge when the patient is already viewing the goals page
  const goalsOnPage = pathname === PORTAL_ROUTES.goals;
  const badges: Badges = { messages: unreadMessages, goals: goalsOnPage ? 0 : newGoals };

  return (
    <nav className={styles.nav} aria-label="Portal navigation">
      {NAV_GROUPS.map((group, gi) => (
        <div key={gi} className={styles.navGroup}>
          {group.map(({ href, label, Icon, badgeKey }) => {
            const active = isActive(pathname, href);
            const count = badgeKey ? badges[badgeKey] : 0;
            const showCheckinDot = href === PORTAL_ROUTES.checkin && !hasTodayCheckin && !active;
            return (
              <Link
                key={href}
                href={href}
                className={active ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
                aria-current={active ? "page" : undefined}
              >
                <span className={styles.navIcon}><Icon /></span>
                <span className={styles.navLabel}>{label}</span>
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

export function BottomNav({ unreadMessages = 0, hasTodayCheckin = true, newGoals = 0 }: { unreadMessages?: number; hasTodayCheckin?: boolean; newGoals?: number }) {
  const pathname = usePathname();
  const goalsOnPage = pathname === PORTAL_ROUTES.goals;
  const badges: Badges = { messages: unreadMessages, goals: goalsOnPage ? 0 : newGoals };

  return (
    <nav className={styles.bottomNav} aria-label="Mobile navigation">
      {BOTTOM_ITEMS.map(({ href, label, Icon, badgeKey }) => {
        const active = isActive(pathname, href);
        const count = badgeKey ? badges[badgeKey] : 0;
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
            <span className={styles.bottomNavLabel}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
