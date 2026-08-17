import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import styles from "./admin.module.css";
import { UserDropdown } from "@/components/portal/UserDropdown";
import { AdminNav } from "@/components/admin/AdminNav";
import { NavBreadcrumb } from "@/components/portal/NavBreadcrumb";
import { db } from "@/lib/db";
import { users, bookings, profiles, clinicianApplications } from "@/lib/db/schema";
import { eq, inArray, count, and, gt } from "drizzle-orm";
import { getUnreadThreadCount } from "@/lib/domain/messages";
import { USER_ROLE } from "@/lib/config/auth";
import { BOOKING_STATUS } from "@/lib/config/booking-status";
import { PATIENT_SIGNAL } from "@/lib/config/admin";
import { COMPANY } from "@/lib/config/company";
import { PORTAL_ROUTES } from "@/lib/config/routes";

// Private admin area — defense-in-depth alongside robots.txt disallow.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== USER_ROLE.admin) redirect(PORTAL_ROUTES.dashboard);

  const [dbUser, adminProfile, unreadMessages, urgentPatients, pendingApplications] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { name: true },
    }),
    db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
      columns: { bookingsSeenAt: true },
    }),
    getUnreadThreadCount(session.user.id),
    // Count patients whose stored signal is critical or attention — fast single-table read
    db.select({ value: count() }).from(profiles).where(inArray(profiles.lastKnownSignal, [PATIENT_SIGNAL.critical, PATIENT_SIGNAL.attention])).then((r) => r[0]?.value ?? 0),
    db.select({ value: count() }).from(clinicianApplications).where(eq(clinicianApplications.status, "pending")).then((r) => r[0]?.value ?? 0),
  ]);

  // A native slot booking is born CONFIRMED, never "pending" — counting only
  // pending status meant a real new booking produced no visible signal
  // anywhere in the admin UI. "New" here means "exists and hasn't been seen",
  // same contract as the patient portal's goalsSeenAt badge.
  const bookingsSeenAt = adminProfile?.bookingsSeenAt ?? null;
  const activeStatuses = [BOOKING_STATUS.pending, BOOKING_STATUS.confirmed];
  const newBookings = await db
    .select({ value: count() })
    .from(bookings)
    .where(
      bookingsSeenAt
        ? and(inArray(bookings.status, activeStatuses), gt(bookings.createdAt, bookingsSeenAt))
        : inArray(bookings.status, activeStatuses)
    )
    .then((r) => r[0]?.value ?? 0);

  const name = dbUser?.name ?? "";
  const email = session.user.email ?? "";

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.logoLink} aria-label={`${COMPANY.shortName} — home`}>
          <Logo variant="bright" />
        </Link>
        <p className={styles.adminBadge}>Admin</p>
        <AdminNav
          unreadMessages={unreadMessages}
          newBookings={newBookings}
          urgentPatients={urgentPatients}
          pendingApplications={pendingApplications}
        />
        <Link href={PORTAL_ROUTES.dashboard} className={styles.roleSwitch}>
          ← Patient portal
        </Link>
      </aside>
      <div className={styles.mainWrap}>
        <header className={styles.header}>
          <NavBreadcrumb />
          <UserDropdown name={name} email={email} role={USER_ROLE.admin} context="admin" />
        </header>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
