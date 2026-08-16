import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import styles from "./portal.module.css";
import { UserDropdown } from "@/components/portal/UserDropdown";
import { PortalNav, BottomNav } from "@/components/portal/PortalNav";
import { NavBreadcrumb } from "@/components/portal/NavBreadcrumb";
import { db } from "@/lib/db";
import { users, dailyCheckins, clinicalGoals, profiles } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getUnreadThreadCount } from "@/lib/domain/messages";
import { formatDateISO } from "@/lib/utils/format";
import { COMPANY } from "@/lib/config/company";
import { USER_ROLE } from "@/lib/config/auth";
import { ADMIN_ROUTES, AUTH_ROUTES } from "@/lib/config/routes";

// Private patient area — defense-in-depth alongside robots.txt disallow.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect(AUTH_ROUTES.login);

  const today = formatDateISO(new Date());

  const [dbUser, unreadMessages, todayCheckin, patientProfile, activeGoalDates] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { name: true },
    }),
    getUnreadThreadCount(session.user.id),
    db.query.dailyCheckins.findFirst({
      where: and(eq(dailyCheckins.userId, session.user.id), eq(dailyCheckins.date, today)),
      columns: { id: true },
    }),
    db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
      columns: { goalsSeenAt: true },
    }),
    db.query.clinicalGoals.findMany({
      where: and(eq(clinicalGoals.patientId, session.user.id), isNull(clinicalGoals.completedAt)),
      columns: { createdAt: true },
    }),
  ]);

  const goalsSeenAt = patientProfile?.goalsSeenAt ?? null;
  const newGoalsCount = activeGoalDates.filter(
    (g) => !goalsSeenAt || g.createdAt > goalsSeenAt
  ).length;

  const hasTodayCheckin = !!todayCheckin;

  const name = dbUser?.name ?? "";
  const email = session.user.email ?? "";

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.logoLink} aria-label={`${COMPANY.shortName} — home`}>
          <Logo variant="bright" />
        </Link>
        <PortalNav unreadMessages={unreadMessages} hasTodayCheckin={hasTodayCheckin} newGoals={newGoalsCount} />
        {/* Lands on Today, not the patient list. The list answers "how is
            everyone"; the first question on arriving is "what needs me". */}
        {session.user.role === USER_ROLE.admin && (
          <Link href={ADMIN_ROUTES.root} className={styles.roleSwitch}>
            Clinician area →
          </Link>
        )}
      </aside>

      <div className={styles.mainWrap}>
        <header className={styles.header}>
          <NavBreadcrumb />
          <UserDropdown name={name} email={email} role={session.user.role} />
        </header>
        <main className={styles.main}>{children}</main>
      </div>

      <BottomNav unreadMessages={unreadMessages} hasTodayCheckin={hasTodayCheckin} newGoals={newGoalsCount} />
    </div>
  );
}
