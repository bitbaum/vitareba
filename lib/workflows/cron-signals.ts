import { db } from "@/lib/db";
import {
  users,
  profiles,
  assessmentResults,
  bookings,
  dailyCheckins,
  clinicalGoals,
} from "@/lib/db/schema";
import { eq, desc, isNull } from "drizzle-orm";
import { sendEmail } from "@/lib/email/index";
import {
  criticalPatientAlertEmail,
  goalAchievedAdminEmail,
  goalAchievedPatientEmail,
} from "@/lib/email/templates";
import { computePatientSignal } from "@/lib/domain/signals";
import { normalizeCheckinMetric } from "@/lib/domain/checkin";
import { computeGoalProgress } from "@/lib/domain/goals";
import {
  PATIENT_SIGNAL,
  CHECKIN_GOAL_METRICS,
  SIGNAL_CHECKIN_WINDOW_DAYS,
  type CheckinGoalMetric,
} from "@/lib/config/admin";
import { ASSESSMENT_GOAL_METRIC_KEY, GOAL_PROGRESS_COMPLETE_PCT } from "@/lib/config/portal";
import { USER_ROLE } from "@/lib/config/auth";
import { PORTAL_URL, getAdminEmails } from "@/lib/config/company";
import { ADMIN_ROUTES, PORTAL_ROUTES } from "@/lib/config/routes";
import { displayName } from "@/lib/utils/format";
import { clinicianLabelFor } from "@/lib/domain/clinician-label";
import { createNotification, createNotificationForMany } from "@/lib/domain/notifications";
import { NOTIFICATION_TYPE } from "@/lib/config/notifications";

export type CronSignalsResult =
  | { success: true; alerts: number; goalsCompleted: number; checked: number }
  | { success: false; error: "Database unavailable" };

export async function runCronSignals(now: Date = new Date()): Promise<CronSignalsResult> {
  const adminEmails = getAdminEmails();

  let patients;
  try {
    patients = await db.query.users.findMany({
      where: eq(users.role, USER_ROLE.patient),
      with: {
        profile: { columns: { lastKnownSignal: true } },
        assessmentResults: {
          orderBy: [desc(assessmentResults.completedAt)],
          limit: 2,
        },
        bookings: {
          orderBy: [desc(bookings.createdAt)],
          limit: 1,
        },
        dailyCheckins: {
          orderBy: [desc(dailyCheckins.date)],
          limit: SIGNAL_CHECKIN_WINDOW_DAYS,
        },
        clinicalGoals: {
          where: isNull(clinicalGoals.completedAt),
        },
      },
    });
  } catch (err) {
    console.error("[cron/signals] DB read failed:", err);
    return { success: false, error: "Database unavailable" };
  }

  // Non-critical: a failed admin lookup should degrade to "no in-app fan-out
  // this run", not fail the whole signals job.
  let adminUserIds: string[] = [];
  try {
    const adminUsers = await db.query.users.findMany({
      where: eq(users.role, USER_ROLE.admin),
      columns: { id: true },
    });
    adminUserIds = adminUsers.map((a) => a.id);
  } catch (err) {
    console.error("[cron/signals] admin lookup failed:", err);
  }

  let alerts = 0;
  let goalsCompleted = 0;
  const dbWrites: Promise<unknown>[] = [];
  const notificationWrites: Promise<unknown>[] = [];

  for (const patient of patients) {
    const { signal, reason } = computePatientSignal({
      registeredAt: patient.createdAt,
      checkins: patient.dailyCheckins,
      assessments: patient.assessmentResults.map((a) => ({
        overallScore: a.overallScore,
        completedAt: a.completedAt,
      })),
      bookings: patient.bookings,
      now,
    });

    const previousSignal = patient.profile?.lastKnownSignal ?? null;

    if (signal === PATIENT_SIGNAL.critical && previousSignal !== PATIENT_SIGNAL.critical) {
      const patientName = displayName(patient.name, patient.email);
      const adminUrl = `${PORTAL_URL}${ADMIN_ROUTES.patients}/${patient.id}`;
      const recentCheckins = patient.dailyCheckins.slice(0, 3).map((c) => ({
        date: c.date,
        sleep: c.sleep,
        energy: c.energy,
        mood: c.mood,
        focus: c.focus,
        stress: c.stress,
      }));
      const assessmentHistory = patient.assessmentResults.map((a) => ({
        score: a.overallScore,
        completedAt:
          a.completedAt instanceof Date
            ? a.completedAt.toISOString().slice(0, 10)
            : String(a.completedAt).slice(0, 10),
      }));

      if (adminEmails.length > 0) {
        const results = await Promise.allSettled(
          adminEmails.map((adminEmail) =>
            sendEmail({
              to: adminEmail,
              subject: `⚠ Critical patient: ${patientName}`,
              html: criticalPatientAlertEmail({
                patientName,
                patientEmail: patient.email,
                reason,
                adminUrl,
                recentCheckins,
                assessmentHistory,
              }),
            }),
          ),
        );
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            console.error(
              "[cron/signals] alert send failed for",
              patient.id,
              "to",
              adminEmails[index],
              result.reason,
            );
          }
        });
        if (results.some((result) => result.status === "fulfilled")) {
          alerts++;
        }
      }
      notificationWrites.push(
        createNotificationForMany(adminUserIds, {
          type: NOTIFICATION_TYPE.criticalSignal,
          title: `Critical patient: ${patientName}`,
          body: reason,
          href: `${ADMIN_ROUTES.patients}/${patient.id}`,
        }),
      );
    }

    const latestAssessment = patient.assessmentResults[0];
    const checkins = patient.dailyCheckins;
    for (const goal of patient.clinicalGoals ?? []) {
      if (!goal.metric) continue;

      let liveValue: number | null = null;

      if (goal.metric === ASSESSMENT_GOAL_METRIC_KEY && latestAssessment) {
        liveValue = latestAssessment.overallScore;
      } else if (
        (CHECKIN_GOAL_METRICS as readonly string[]).includes(goal.metric) &&
        checkins.length > 0
      ) {
        const key = goal.metric as CheckinGoalMetric;
        const sum = checkins.reduce((acc, c) => acc + c[key], 0);
        liveValue = normalizeCheckinMetric(sum / checkins.length);
      }

      if (liveValue !== null && liveValue !== goal.current) {
        const progress = computeGoalProgress(goal.baseline, liveValue, goal.target);
        const isNewlyAchieved =
          progress !== null && progress >= GOAL_PROGRESS_COMPLETE_PCT && goal.completedAt === null;

        dbWrites.push(
          db
            .update(clinicalGoals)
            .set({
              current: liveValue,
              ...(isNewlyAchieved ? { completedAt: now } : {}),
              updatedAt: now,
            })
            .where(eq(clinicalGoals.id, goal.id)),
        );

        if (isNewlyAchieved) {
          goalsCompleted++;
          const patientName = displayName(patient.name, patient.email);
          const adminUrl = `${PORTAL_URL}${ADMIN_ROUTES.patients}/${patient.id}`;
          for (const adminEmail of adminEmails) {
            notificationWrites.push(
              sendEmail({
                to: adminEmail,
                subject: `Goal achieved: ${patientName} — ${goal.title}`,
                html: goalAchievedAdminEmail({ patientName, goalTitle: goal.title, adminUrl }),
              }).catch((err) =>
                console.error(
                  "[cron/signals] goal achievement admin email failed:",
                  patient.id,
                  err,
                ),
              ),
            );
          }
          notificationWrites.push(
            createNotificationForMany(adminUserIds, {
              type: NOTIFICATION_TYPE.goalAchieved,
              title: `Goal achieved: ${patientName} — ${goal.title}`,
              href: `${ADMIN_ROUTES.patients}/${patient.id}`,
            }),
          );
          if (patient.email) {
            notificationWrites.push(
              sendEmail({
                to: patient.email,
                subject: `Goal achieved: ${goal.title}`,
                html: goalAchievedPatientEmail({
                  patientName,
                  goalTitle: goal.title,
                  portalUrl: PORTAL_URL,
                  clinician: await clinicianLabelFor(patient.id),
                }),
              }).catch((err) =>
                console.error(
                  "[cron/signals] goal achievement patient email failed:",
                  patient.id,
                  err,
                ),
              ),
            );
          }
          notificationWrites.push(
            createNotification({
              userId: patient.id,
              type: NOTIFICATION_TYPE.goalAchieved,
              title: `Goal achieved: ${goal.title}`,
              href: PORTAL_ROUTES.goals,
            }),
          );
        }
      }
    }

    if (signal !== previousSignal) {
      dbWrites.push(
        db
          .insert(profiles)
          .values({ userId: patient.id, lastKnownSignal: signal, lastKnownSignalAt: now })
          .onConflictDoUpdate({
            target: profiles.userId,
            set: { lastKnownSignal: signal, lastKnownSignalAt: now },
          }),
      );
    }
  }

  await Promise.all(dbWrites);
  await Promise.all(notificationWrites);

  return { success: true, alerts, goalsCompleted, checked: patients.length };
}
