import { db } from "@/lib/db";
import { users, assessmentResults, dailyCheckins } from "@/lib/db/schema";
import { eq, desc, gte } from "drizzle-orm";
import { sendEmail } from "@/lib/email/index";
import { checkinReminderEmail } from "@/lib/email/templates";
import { PORTAL_URL } from "@/lib/config/company";
import { formatDateISO, displayName } from "@/lib/utils/format";
import { clinicianLabelFor } from "@/lib/domain/clinician-label";
import { USER_ROLE } from "@/lib/config/auth";
import { computeStreak } from "@/lib/domain/checkin";
import { CHECKIN_HISTORY_DAYS } from "@/lib/config/portal";

export type CronCheckinReminderResult =
  | { success: true; sent: number; skipped: number }
  | { success: false; error: "Database unavailable" };

export async function runCronCheckinReminder(now: Date = new Date()): Promise<CronCheckinReminderResult> {
  const today = formatDateISO(now);
  const historyStart = new Date(now);
  historyStart.setDate(historyStart.getDate() - CHECKIN_HISTORY_DAYS);
  const historyStartISO = formatDateISO(historyStart);

  let patients;
  try {
    patients = await db.query.users.findMany({
      where: eq(users.role, USER_ROLE.patient),
      with: {
        profile: { columns: { reminderOptOut: true } },
        assessmentResults: {
          orderBy: [desc(assessmentResults.completedAt)],
          limit: 1,
        },
        dailyCheckins: {
          where: gte(dailyCheckins.date, historyStartISO),
          orderBy: [desc(dailyCheckins.date)],
        },
      },
    });
  } catch (err) {
    console.error("[cron/checkin-reminder] DB read failed:", err);
    return { success: false, error: "Database unavailable" };
  }

  const sendable = patients.filter(
    (patient) =>
      patient.email &&
      !patient.profile?.reminderOptOut &&
      patient.assessmentResults.length > 0 &&
      !patient.dailyCheckins.some((checkin) => checkin.date === today)
  );
  const skipped = patients.length - sendable.length;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const results = await Promise.allSettled(
    sendable.map(async (patient) => {
      const patientName = displayName(patient.name, patient.email);
      const atRiskStreak = computeStreak(patient.dailyCheckins, yesterday);
      const clinician = await clinicianLabelFor(patient.id);
      return sendEmail({
        to: patient.email!,
        subject: atRiskStreak >= 2
          ? `🔥 ${atRiskStreak}-day streak — log today to keep it alive`
          : "How are you doing today?",
        html: checkinReminderEmail({ patientName, portalUrl: PORTAL_URL, atRiskStreak, clinician }),
      });
    })
  );

  let sent = 0;
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      sent++;
    } else {
      console.error("[cron/checkin-reminder] send failed for", sendable[index].id, result.reason);
    }
  });

  return { success: true, sent, skipped: skipped + (sendable.length - sent) };
}
