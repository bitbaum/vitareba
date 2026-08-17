"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import styles from "@/app/(admin)/admin.module.css";
import { BADGE_MAX_COUNT } from "@/lib/config/portal";
import { ADMIN_ROUTES } from "@/lib/config/routes";

type NavItem = {
  href: string;
  label: string;
  badgeKey?: "messages" | "bookings" | "patients" | "applications";
};

const NAV_ITEMS: NavItem[] = [
  // First, and unbadged on purpose: the page whose job is to tell you what is
  // waiting does not also need a number shouting the same thing at it.
  { href: ADMIN_ROUTES.root,         label: "Today" },
  { href: ADMIN_ROUTES.patients,     label: "Patients",  badgeKey: "patients" },
  { href: ADMIN_ROUTES.bookings,     label: "Bookings",  badgeKey: "bookings" },
  { href: ADMIN_ROUTES.messages,     label: "Messages",  badgeKey: "messages" },
  { href: ADMIN_ROUTES.documents,    label: "Documents" },
  { href: ADMIN_ROUTES.applications, label: "Applications", badgeKey: "applications" },
  { href: ADMIN_ROUTES.reports,      label: "Reports" },
  { href: ADMIN_ROUTES.profile,      label: "My Profile" },
];

function isActive(pathname: string, href: string): boolean {
  // The root is a page, not a prefix. Without this exception every admin URL
  // starts with "/admin/" and "Today" would light up on all of them.
  if (href === ADMIN_ROUTES.root) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function AdminNav({
  unreadMessages = 0,
  newBookings = 0,
  urgentPatients = 0,
  pendingApplications = 0,
}: {
  unreadMessages?: number;
  newBookings?: number;
  urgentPatients?: number;
  pendingApplications?: number;
}) {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      {NAV_ITEMS.map(({ href, label, badgeKey }) => {
        const active = isActive(pathname, href);
        const count =
          badgeKey === "messages" ? unreadMessages :
          badgeKey === "bookings" ? newBookings :
          badgeKey === "patients" ? urgentPatients :
          badgeKey === "applications" ? pendingApplications :
          0;
        return (
          <Link
            key={href}
            href={href}
            className={`${styles.navItem}${active ? ` ${styles.navItemActive}` : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {label}
            {count > 0 && (
              <span
                className={badgeKey === "patients" ? styles.navBadgeUrgent : styles.navBadge}
                aria-label={badgeKey === "patients" ? `${count} patients need attention` : `${count} new`}
              >
                {count > BADGE_MAX_COUNT ? `${BADGE_MAX_COUNT}+` : count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
