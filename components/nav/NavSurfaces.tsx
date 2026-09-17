"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BADGE_MAX_COUNT } from "@/lib/config/portal";

/**
 * The two nav surfaces — desktop sidebar, mobile bottom bar — rendered once.
 *
 * PortalNav and AdminNav had these written out twice each: the same anchor, the
 * same icon/label/badge order, the same `aria-current`. That mattered more than
 * the line count. Admin's overflow sheet once shipped without `aria-current`,
 * so exactly the destinations that fell behind "More" were the ones a
 * screen-reader user could not locate themselves in. With one renderer, an
 * accessibility fix lands on both sides or neither.
 *
 * What stays per-surface is what genuinely differs: WHICH routes, what they are
 * called, and the CSS module they are painted with. Those arrive as props.
 *
 * `styles` is the caller's CSS module (`admin.module.css` / `portal.module.css`).
 * CSS modules are typed as a plain string map, so a typo here would render
 * `class="undefined"` rather than fail to compile — `nav-styles.test.ts` closes
 * that gap by asserting every class name read below exists in BOTH modules.
 */
export type NavStyles = Readonly<Record<string, string>>;

/** A live count on a nav item. Resolved by the caller: the class and the wording differ per surface. */
export type NavBadge = { text: string; className: string; ariaLabel?: string };

/** A silent marker with no count — the portal's "you have not checked in today" dot. */
export type NavDot = { className: string; ariaLabel: string };

export type NavEntry = {
  href: string;
  /** Already resolved: the bottom bar passes its short label here. */
  label: string;
  Icon: React.ComponentType;
  active: boolean;
  badge?: NavBadge | null;
  dot?: NavDot | null;
};

export type NavGroup = { label: string | null; items: NavEntry[] };

/**
 * The area root is a page, not a prefix. Without that exception every admin URL
 * starts with "/admin/" and "Today" lights up on all of them.
 */
export function isActive(pathname: string, href: string, rootHref: string): boolean {
  if (href === rootHref) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

/** "3", or "9+" once a count stops being worth reading exactly. */
export function badgeText(count: number): string {
  return count > BADGE_MAX_COUNT ? `${BADGE_MAX_COUNT}+` : String(count);
}

// ─── Sidebar (desktop) ────────────────────────────────────────────────────────

export function NavSidebar({
  styles,
  ariaLabel,
  groups,
}: {
  styles: NavStyles;
  ariaLabel: string;
  groups: NavGroup[];
}) {
  return (
    <nav className={styles.nav} aria-label={ariaLabel}>
      {groups.map((group, gi) => (
        <div key={gi} className={styles.navGroup}>
          {group.label && <div className={styles.navGroupLabel}>{group.label}</div>}
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={item.active ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
              aria-current={item.active ? "page" : undefined}
            >
              <span className={styles.navIcon}>
                <item.Icon />
              </span>
              <span className={styles.navLabel}>{item.label}</span>
              {item.badge && (
                <span className={item.badge.className} aria-label={item.badge.ariaLabel}>
                  {item.badge.text}
                </span>
              )}
              {item.dot && <span className={item.dot.className} aria-label={item.dot.ariaLabel} />}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

// ─── Bottom tab bar (mobile) ──────────────────────────────────────────────────

/**
 * `children` is the trailing slot: admin puts its "More" button there, because
 * eight destinations do not fit a thumb-reachable bar and the portal's five do.
 * `onNavigate` lets a surface close that sheet when a tab is tapped.
 */
export function NavBottomBar({
  styles,
  ariaLabel,
  items,
  onNavigate,
  children,
}: {
  styles: NavStyles;
  ariaLabel: string;
  items: NavEntry[];
  onNavigate?: () => void;
  children?: ReactNode;
}) {
  return (
    <nav className={styles.bottomNav} aria-label={ariaLabel}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={
            item.active
              ? `${styles.bottomNavItem} ${styles.bottomNavItemActive}`
              : styles.bottomNavItem
          }
          aria-current={item.active ? "page" : undefined}
          onClick={onNavigate}
        >
          <span className={styles.bottomNavIcon}>
            <item.Icon />
            {item.dot && <span className={item.dot.className} aria-label={item.dot.ariaLabel} />}
            {item.badge && (
              <span className={styles.bottomNavBadge} aria-label={item.badge.ariaLabel}>
                {item.badge.text}
              </span>
            )}
          </span>
          <span className={styles.bottomNavLabel}>{item.label}</span>
        </Link>
      ))}
      {children}
    </nav>
  );
}
