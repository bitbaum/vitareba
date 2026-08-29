import { db } from "@/lib/db";
import { users, dailyCheckins, profiles } from "@/lib/db/schema";
import { eq, desc, gte } from "drizzle-orm";
import { sendEmail } from "@/lib/email/index";
import { checkinDipAlertEmail } from "@/lib/email/templates";
import { PORTAL_URL, getAdminEmails } from "@/lib/config/company";
import { CHECKIN_DIP_ALERT_THRESHOLD, CHECKIN_DIP_ALERT_DAYS } from "@/lib/config/admin";
import { DAY_MS, formatDateISO, displayName } from "@/lib/utils/format";
import { USER_ROLE } from "@/lib/config/auth";
import { ADMIN_ROUTES } from "@/lib/config/routes";

export type CronCheckinDipAlertResult =
  | { success: true; alerted: number; skipped: number }
  | { success: false; error: "Database unavailable" };

export async function runCronCheckinDipAlert(
  now: Date = new Date(),
): Promise<CronCheckinDipAlertResult> {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - CHECKIN_DIP_ALERT_DAYS);
  const cutoffDate = formatDateISO(cutoff);

  let patients;
  try {
    patients = await db.query.users.findMany({
      where: eq(users.role, USER_ROLE.patient),
      with: {
        profile: { columns: { dipAlertSentAt: true } },
        dailyCheckins: {
          where: gte(dailyCheckins.date, cutoffDate),
          orderBy: [desc(dailyCheckins.date)],
        },
      },
    });
  } catch (err) {
    console.error("[cron/checkin-dip-alert] DB read failed:", err);
    return { success: false, error: "Database unavailable" };
  }

  const adminEmails = getAdminEmails();
  if (adminEmails.length === 0) {
    return { success: true, alerted: 0, skipped: patients.length };
  }

  type AlertTask = { patientId: string; html: string; patientName: string };
  const alertTasks: AlertTask[] = [];
  let skipped = 0;

  for (const patient of patients) {
    if ((patient.dailyCheckins?.length ?? 0) < CHECKIN_DIP_ALERT_DAYS) {
      skipped++;
      continue;
    }

    const recent = patient.dailyCheckins.slice(0, CHECKIN_DIP_ALERT_DAYS);
    const dayAvgs = recent.map((c) => (c.mood + c.energy + c.sleep) / 3);
    if (!dayAvgs.every((avg) => avg <= CHECKIN_DIP_ALERT_THRESHOLD)) {
      skipped++;
      continue;
    }

    const profile = patient.profile;
    if (profile?.dipAlertSentAt) {
      const sentDaysAgo = (now.getTime() - new Date(profile.dipAlertSentAt).getTime()) / DAY_MS;
      if (sentDaysAgo < CHECKIN_DIP_ALERT_DAYS) {
        skipped++;
        continue;
      }
    }

    const overallAvg = dayAvgs.reduce((a, b) => a + b, 0) / dayAvgs.length;
    const patientName = displayName(patient.name, patient.email, "Unknown");
    const adminUrl = `${PORTAL_URL}${ADMIN_ROUTES.patients}/${patient.id}`;

    alertTasks.push({
      patientId: patient.id,
      patientName,
      html: checkinDipAlertEmail({
        patientName,
        patientEmail: patient.email ?? "",
        avgScore: overallAvg,
        days: CHECKIN_DIP_ALERT_DAYS,
        adminUrl,
        dipDays: recent.map((c) => ({
          date: c.date,
          sleep: c.sleep,
          energy: c.energy,
          mood: c.mood,
          focus: c.focus,
          stress: c.stress,
          note: c.notes ?? undefined,
        })),
      }),
    });
  }

  const results = await Promise.allSettled(
    alertTasks.map(({ patientId, patientName, html }) =>
      (async () => {
        const sends = await Promise.allSettled(
          adminEmails.map((adminEmail) =>
            sendEmail({
              to: adminEmail,
              subject: `⚠️ Check-in dip alert — ${patientName}`,
              html,
            }),
          ),
        );
        sends.forEach((result, index) => {
          if (result.status === "rejected") {
            console.error(
              "[cron/checkin-dip-alert] send failed for",
              patientId,
              "to",
              adminEmails[index],
              result.reason,
            );
          }
        });
        if (sends.some((result) => result.status === "fulfilled")) {
          await db
            .update(profiles)
            .set({ dipAlertSentAt: now })
            .where(eq(profiles.userId, patientId));
          return true;
        }
        throw new Error(`No dip alert email delivered for patient ${patientId}`);
      })(),
    ),
  );

  return {
    success: true,
    alerted: results.filter((result) => result.status === "fulfilled").length,
    skipped,
  };
}
