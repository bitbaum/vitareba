import { db } from "@/lib/db";
import { emailQueue, assessmentResults, bookings, profiles } from "@/lib/db/schema";
import { eq, lte, and, inArray } from "drizzle-orm";
import { computeProfileCompleteness } from "@/lib/domain/profile";
import { BOOKING_STATUS } from "@/lib/config/booking-status";
import { sendEmail, isEmailConfigured } from "@/lib/email/index";
import {
  assessmentResultsEmail,
  assessmentMeaningEmail,
  assessmentBookingEmail,
  welcomePatientEmail,
  profileCompletionEmail,
  assessmentCtaEmail,
} from "@/lib/email/templates";
import { DIMENSIONS, getVerdict, getInterpretation } from "@/lib/assessment/data";
import { COMPANY, PORTAL_URL } from "@/lib/config/company";
import { EMAIL_TEMPLATE } from "@/lib/config/email-sequences";
import { EMAIL_QUEUE_STATUS } from "@/lib/config/email-queue";
import { GOAL_PROGRESS_COMPLETE_PCT } from "@/lib/config/portal";
import { displayName } from "@/lib/utils/format";

export type CronEmailsResult =
  | { success: true; sent: number; failed: number; processed: number }
  | { success: false; error: "Database unavailable" | "Email provider not configured" };

export async function runCronEmails(now: Date = new Date()): Promise<CronEmailsResult> {
  // No provider → leave every row pending (retried next run once configured)
  // instead of "sending" into the void and marking the queue sent.
  if (!isEmailConfigured()) {
    console.error("[cron/emails] RESEND_API_KEY not configured — queue left pending");
    return { success: false, error: "Email provider not configured" };
  }

  let pending;
  try {
    pending = await db.query.emailQueue.findMany({
      where: and(
        eq(emailQueue.status, EMAIL_QUEUE_STATUS.pending),
        lte(emailQueue.sendAt, now)
      ),
      with: { user: { columns: { name: true, email: true } } },
    });
  } catch (err) {
    console.error("[cron/emails] DB read failed:", err);
    return { success: false, error: "Database unavailable" };
  }

  let sent = 0;
  let failed = 0;

  for (const item of pending) {
    const user = item.user;
    if (!user?.email) {
      await db
        .update(emailQueue)
        .set({ status: EMAIL_QUEUE_STATUS.failed, sentAt: now })
        .where(eq(emailQueue.id, item.id));
      failed++;
      continue;
    }

    const payload = item.payload as Record<string, unknown>;
    const patientName = displayName(user.name, user.email);

    try {
      let html: string;
      let subject: string;

      if (item.templateKey === EMAIL_TEMPLATE.assessmentResults) {
        const overallScore = payload.overallScore as number;
        const scores = payload.scores as Record<string, number>;
        const verdict = getVerdict(overallScore);
        const dimensions = DIMENSIONS.map((dim) => ({
          icon: dim.icon,
          name: dim.name,
          score: scores[dim.id] ?? 0,
          interpretation: getInterpretation(dim.id, scores[dim.id] ?? 0),
        }));
        html = assessmentResultsEmail({
          patientName,
          overallScore,
          verdictName: verdict.name,
          verdictText: verdict.text,
          dimensions,
          portalUrl: PORTAL_URL,
        });
        subject = `Your Inflection Edge results — ${verdict.name}`;
      } else if (item.templateKey === EMAIL_TEMPLATE.assessmentMeaning) {
        html = assessmentMeaningEmail({ patientName, portalUrl: PORTAL_URL });
        subject = "What your Inflection Edge profile means clinically";
      } else if (item.templateKey === EMAIL_TEMPLATE.assessmentBooking) {
        const existingBooking = await db.query.bookings.findFirst({
          where: and(
            eq(bookings.userId, item.userId),
            inArray(bookings.status, [BOOKING_STATUS.pending, BOOKING_STATUS.confirmed, BOOKING_STATUS.attended])
          ),
          columns: { id: true },
        });
        if (existingBooking) {
          await db
            .update(emailQueue)
            .set({ status: EMAIL_QUEUE_STATUS.sent, sentAt: now })
            .where(eq(emailQueue.id, item.id));
          sent++;
          continue;
        }
        const overallScore = payload.overallScore as number;
        html = assessmentBookingEmail({ patientName, overallScore, portalUrl: PORTAL_URL });
        subject = `Book a consultation with ${COMPANY.clinicianName}`;
      } else if (item.templateKey === EMAIL_TEMPLATE.welcomePatient) {
        html = welcomePatientEmail({ patientName, portalUrl: PORTAL_URL });
        subject = `Welcome to ${COMPANY.shortName} — here is where to start`;
      } else if (item.templateKey === EMAIL_TEMPLATE.profileCompletion) {
        const existingProfile = await db.query.profiles.findFirst({
          where: eq(profiles.userId, item.userId),
        });
        if (computeProfileCompleteness(existingProfile as Record<string, unknown> | null) >= GOAL_PROGRESS_COMPLETE_PCT) {
          await db
            .update(emailQueue)
            .set({ status: EMAIL_QUEUE_STATUS.sent, sentAt: now })
            .where(eq(emailQueue.id, item.id));
          sent++;
          continue;
        }
        html = profileCompletionEmail({ patientName, portalUrl: PORTAL_URL });
        subject = "One thing before your first consultation";
      } else if (item.templateKey === EMAIL_TEMPLATE.assessmentCta) {
        const existingResult = await db.query.assessmentResults.findFirst({
          where: eq(assessmentResults.userId, item.userId),
          columns: { id: true },
        });
        if (existingResult) {
          await db
            .update(emailQueue)
            .set({ status: EMAIL_QUEUE_STATUS.sent, sentAt: now })
            .where(eq(emailQueue.id, item.id));
          sent++;
          continue;
        }
        html = assessmentCtaEmail({ patientName, portalUrl: PORTAL_URL });
        subject = "Your Inflection Edge is waiting";
      } else {
        await db
          .update(emailQueue)
          .set({ status: EMAIL_QUEUE_STATUS.failed, sentAt: now })
          .where(eq(emailQueue.id, item.id));
        failed++;
        continue;
      }

      const result = await sendEmail({ to: user.email, subject, html });
      if (!result.sent) throw new Error(result.error);

      await db
        .update(emailQueue)
        .set({ status: EMAIL_QUEUE_STATUS.sent, sentAt: now })
        .where(eq(emailQueue.id, item.id));
      sent++;
    } catch (err) {
      console.error("[cron/emails] send failed for", item.id, err);
      await db
        .update(emailQueue)
        .set({ status: EMAIL_QUEUE_STATUS.failed, sentAt: now })
        .where(eq(emailQueue.id, item.id));
      failed++;
    }
  }

  return { success: true, sent, failed, processed: pending.length };
}
