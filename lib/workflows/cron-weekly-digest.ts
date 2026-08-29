import { db } from "@/lib/db";
import { users, assessmentResults, bookings, dailyCheckins, clinicalGoals } from "@/lib/db/schema";
import { eq, gte, and, desc, inArray, isNull } from "drizzle-orm";
import { computeGoalProgress } from "@/lib/domain/goals";
import { computeStreak } from "@/lib/domain/checkin";
import { sendEmail } from "@/lib/email/index";
import { weeklyDigestEmail } from "@/lib/email/templates";
import { getVerdictName } from "@/lib/assessment/data";
import { PORTAL_URL, COMPANY } from "@/lib/config/company";
import { formatDateISO, displayName } from "@/lib/utils/format";
import { clinicianLabelFor } from "@/lib/domain/clinician-label";
import { USER_ROLE } from "@/lib/config/auth";
import {
  CHECKIN_METRICS,
  DAYS_PER_WEEK,
  WEEKLY_DIGEST_STREAK_WINDOW_DAYS,
  type MetricKey,
} from "@/lib/config/portal";
import { BOOKING_STATUS, BOOKING_STATUS_CONFIG } from "@/lib/config/booking-status";

type WeekAvgs = Record<MetricKey, number> | null;

function avgMetrics(checkins: Array<Record<MetricKey, number>>): WeekAvgs {
  if (checkins.length === 0) return null;
  const result = {} as Record<MetricKey, number>;
  for (const { key } of CHECKIN_METRICS) {
    result[key] = checkins.reduce((acc, checkin) => acc + checkin[key], 0) / checkins.length;
  }
  return result;
}

export type CronWeeklyDigestResult =
  | { success: true; sent: number; skipped: number }
  | { success: false; error: "Database unavailable" };

export async function runCronWeeklyDigest(now: Date = new Date()): Promise<CronWeeklyDigestResult> {
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(thisWeekStart.getDate() - DAYS_PER_WEEK);
  const prevWeekStart = new Date(now);
  prevWeekStart.setDate(prevWeekStart.getDate() - DAYS_PER_WEEK * 2);
  const streakWindowStart = new Date(now);
  streakWindowStart.setDate(streakWindowStart.getDate() - WEEKLY_DIGEST_STREAK_WINDOW_DAYS);

  const thisWeekISO = formatDateISO(thisWeekStart);
  const prevWeekISO = formatDateISO(prevWeekStart);
  const streakWindowISO = formatDateISO(streakWindowStart);

  let patients;
  try {
    patients = await db.query.users.findMany({
      where: eq(users.role, USER_ROLE.patient),
      with: {
        profile: { columns: { digestOptOut: true } },
        assessmentResults: {
          orderBy: [desc(assessmentResults.completedAt)],
          limit: 1,
        },
        bookings: {
          where: inArray(bookings.status, [BOOKING_STATUS.pending, BOOKING_STATUS.confirmed]),
          orderBy: [desc(bookings.createdAt)],
          limit: 1,
        },
        clinicalGoals: {
          where: isNull(clinicalGoals.completedAt),
        },
      },
    });
  } catch (err) {
    console.error("[cron/weekly-digest] DB read failed:", err);
    return { success: false, error: "Database unavailable" };
  }

  const patientIds = patients.map((patient) => patient.id);
  let allCheckins: (typeof dailyCheckins.$inferSelect)[] = [];
  if (patientIds.length > 0) {
    try {
      allCheckins = await db
        .select()
        .from(dailyCheckins)
        .where(
          and(inArray(dailyCheckins.userId, patientIds), gte(dailyCheckins.date, streakWindowISO)),
        );
    } catch (err) {
      console.error("[cron/weekly-digest] checkins DB read failed:", err);
      return { success: false, error: "Database unavailable" };
    }
  }

  const checkinsByPatient = new Map<string, typeof allCheckins>();
  for (const checkin of allCheckins) {
    const list = checkinsByPatient.get(checkin.userId) ?? [];
    list.push(checkin);
    checkinsByPatient.set(checkin.userId, list);
  }

  const sendable = patients.filter((patient) => {
    if (!patient.email) return false;
    if (patient.profile?.digestOptOut) return false;
    const hasAssessment = patient.assessmentResults.length > 0;
    const recentCheckins = checkinsByPatient.get(patient.id) ?? [];
    return hasAssessment || recentCheckins.length > 0;
  });
  const skippedCount = patients.length - sendable.length;

  const results = await Promise.allSettled(
    sendable.map(async (patient) => {
      const recentCheckins = checkinsByPatient.get(patient.id) ?? [];
      const thisWeekCheckins = recentCheckins.filter((checkin) => checkin.date >= thisWeekISO);
      const prevWeekCheckins = recentCheckins.filter(
        (checkin) => checkin.date >= prevWeekISO && checkin.date < thisWeekISO,
      );

      const latestAssessment = patient.assessmentResults[0];
      const latestScore = latestAssessment?.overallScore ?? null;
      const goalSummaries = (patient.clinicalGoals ?? [])
        .filter((goal) => goal.current != null && goal.target != null)
        .map((goal) => ({
          title: goal.title,
          pct: computeGoalProgress(goal.baseline, goal.current as number, goal.target as number),
          current: goal.current as number,
          target: goal.target as number,
        }))
        .filter((goal) => goal.pct !== null) as {
        title: string;
        pct: number;
        current: number;
        target: number;
      }[];

      const streak = computeStreak(recentCheckins, now);
      const html = weeklyDigestEmail({
        patientName: displayName(patient.name, patient.email),
        thisWeekAvgs: avgMetrics(thisWeekCheckins),
        prevWeekAvgs: avgMetrics(prevWeekCheckins),
        latestScore,
        verdictName: latestScore !== null ? getVerdictName(latestScore) : null,
        nextBookingStatus: patient.bookings[0]
          ? BOOKING_STATUS_CONFIG[patient.bookings[0].status].label
          : null,
        activeGoals: goalSummaries,
        portalUrl: PORTAL_URL,
        streak,
        clinician: await clinicianLabelFor(patient.id),
      });

      return sendEmail({
        to: patient.email!,
        subject: `Your ${COMPANY.shortName} weekly summary`,
        html,
      });
    }),
  );

  let sent = 0;
  let failed = 0;
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      sent++;
    } else {
      failed++;
      console.error("[cron/weekly-digest] send failed for", sendable[index].id, result.reason);
    }
  });

  return { success: true, sent, skipped: skippedCount + failed };
}
