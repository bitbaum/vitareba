import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  assessmentResults,
  bookings,
  threads,
  users,
  dailyCheckins,
  programmeAssignments,
  profiles,
  clinicalGoals,
} from "@/lib/db/schema";
import { eq, asc, desc, and, isNull, gte, inArray, count } from "drizzle-orm";
import { BOOKING_STATUS } from "@/lib/config/booking-status";
import shared from "../portal.module.css";
import styles from "./dashboard.module.css";
import { RECENT_ASSESSMENTS_LIMIT, DASHBOARD_TREND_DAYS, CHECKIN_HISTORY_DAYS } from "@/lib/config/portal";
import { COMPANY } from "@/lib/config/company";
import { formatDateISO } from "@/lib/utils/format";
import { computeStreak } from "@/lib/domain/checkin";
import { ProgrammeCard } from "./ProgrammeCard";
import { ProfileCompletenessBar } from "./ProfileCompletenessBar";
import { GoalsCard } from "./GoalsCard";
import { CheckinCard } from "./CheckinCard";
import { AssessmentSection } from "./AssessmentSection";
import { computeProfileCompleteness, getMissingProfileFields } from "@/lib/domain/profile";
import { clinicianLabelFor } from "@/lib/domain/clinician-label";
import { getUnreadThreadCount } from "@/lib/domain/messages";
import { computeNextStep } from "@/lib/domain/next-step";
import { DAY_MS } from "@/lib/utils/format";
import { PendingAssessmentSaver } from "./PendingAssessmentSaver";
import { CheckinMiniTrend } from "./CheckinMiniTrend";
import { NextStepCard } from "./NextStepCard";
import { AiInsightCard } from "./AiInsightCard";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) return null;

  const now = new Date();
  const today = formatDateISO(now);
  const historyStart = new Date(now);
  historyStart.setDate(historyStart.getDate() - CHECKIN_HISTORY_DAYS);
  const historyStartISO = formatDateISO(historyStart);

  const [
    recentAssessments,
    latestBooking,
    threadCount,
    unreadMessageCount,
    dbUser,
    todayCheckin,
    programmeAssignment,
    profile,
    activeGoals,
    recentCheckins,
    clinician,
  ] = await Promise.all([
    db.query.assessmentResults.findMany({
      where: eq(assessmentResults.userId, session.user.id),
      orderBy: [desc(assessmentResults.completedAt)],
      limit: RECENT_ASSESSMENTS_LIMIT,
    }),
    db.query.bookings.findFirst({
      // Only show pending/confirmed — attended/cancelled are past and must not
      // appear as "your consultation" in the dashboard card.
      where: and(
        eq(bookings.userId, session.user.id),
        inArray(bookings.status, [BOOKING_STATUS.pending, BOOKING_STATUS.confirmed])
      ),
      // Soonest APPOINTMENT first, not most recently created. A patient with a
      // consultation on Monday and a request typed yesterday was shown the
      // request — "your next appointment" pointing at the one without a time.
      orderBy: [asc(bookings.scheduledAt), desc(bookings.createdAt)],
      with: { clinician: { columns: { id: true, name: true } } },
    }),
    db.select({ value: count() }).from(threads).where(eq(threads.patientId, session.user.id)).then((r) => r[0]?.value ?? 0),
    getUnreadThreadCount(session.user.id),
    db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { name: true },
    }),
    db.query.dailyCheckins.findFirst({
      where: and(
        eq(dailyCheckins.userId, session.user.id),
        eq(dailyCheckins.date, today)
      ),
    }),
    db.query.programmeAssignments.findFirst({
      where: eq(programmeAssignments.patientId, session.user.id),
    }),
    db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    }),
    db.query.clinicalGoals.findMany({
      where: and(
        eq(clinicalGoals.patientId, session.user.id),
        isNull(clinicalGoals.completedAt)
      ),
    }),
    db.query.dailyCheckins.findMany({
      where: and(
        eq(dailyCheckins.userId, session.user.id),
        gte(dailyCheckins.date, historyStartISO)
      ),
      orderBy: [desc(dailyCheckins.date)],
    }),
    // Copy on this page tells the patient what their doctor will do with the
    // data. Which doctor that is comes from care_team, not from config.
    clinicianLabelFor(session.user.id),
  ]);

  const isNewPatient = recentAssessments.length === 0 && !programmeAssignment;

  const firstName =
    dbUser?.name?.split(" ")[0] ?? session.user.email?.split("@")[0] ?? "there";
  const profilePct = computeProfileCompleteness(profile as Record<string, unknown> | null);
  const missingProfileFields = getMissingProfileFields(profile as Record<string, unknown> | null);
  const checkinStreak = computeStreak(recentCheckins);
  // Streak at risk: consecutive days ending yesterday — shown in the prompt when today isn't logged yet
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const atRiskStreak = computeStreak(recentCheckins, yesterday);
  // Last DASHBOARD_TREND_DAYS entries (DESC from DB → slice then reverse for chart)
  const trendCheckins = recentCheckins.slice(0, DASHBOARD_TREND_DAYS);

  const assessmentAgeDays = recentAssessments[0]
    ? Math.floor((now.getTime() - new Date(recentAssessments[0].completedAt).getTime()) / DAY_MS)
    : Infinity;

  const nextStep = computeNextStep({
    hasAssessment: recentAssessments.length > 0,
    checkedInToday: !!todayCheckin,
    atRiskStreak,
    unreadMessages: unreadMessageCount,
    profileCompleteness: profilePct,
    assessmentAgeDays,
    hasUpcomingBooking: !!latestBooking,
  });

  return (
    <div>
      <PendingAssessmentSaver />
      <h1 className={shared.pageTitle}>
        {isNewPatient ? "Welcome" : "Welcome back"}, <em>{firstName}</em>
      </h1>
      <p className={shared.pageSub}>Your {COMPANY.shortName} patient portal</p>

      <div className={styles.dashStack}>
        <NextStepCard step={nextStep} />

        {todayCheckin && (
          <CheckinCard
            streak={checkinStreak}
            todayScores={{
              sleep: todayCheckin.sleep,
              energy: todayCheckin.energy,
              mood: todayCheckin.mood,
              focus: todayCheckin.focus,
              stress: todayCheckin.stress,
            }}
            todayNote={todayCheckin.notes ?? undefined}
          />
        )}

        {programmeAssignment && (
          <ProgrammeCard
            programme={programmeAssignment.programme}
            phase={programmeAssignment.phase}
            clinician={clinician}
          />
        )}

        <GoalsCard goals={activeGoals} />

        <ProfileCompletenessBar
          pct={profilePct}
          missingFields={missingProfileFields}
          clinician={clinician}
        />

        <CheckinMiniTrend checkins={trendCheckins} />

        <AiInsightCard />

        <AssessmentSection
          latestAssessment={recentAssessments[0]}
          previousAssessment={recentAssessments[1]}
          latestBooking={latestBooking}
          threadCount={threadCount}
          unreadMessageCount={unreadMessageCount}
          clinician={clinician}
        />
      </div>
    </div>
  );
}
