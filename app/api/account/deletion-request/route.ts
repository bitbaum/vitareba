export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { serviceUnavailable } from "@/lib/utils/api-response";
import { db } from "@/lib/db";
import { threads, threadMessages } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { getAdminEmails, COMPANY, PORTAL_URL } from "@/lib/config/company";
import { ADMIN_ROUTES } from "@/lib/config/routes";
import { runAfterResponse } from "@/lib/utils/post-response";

const REQUEST_SUBJECT = "Account deletion request (GDPR Art. 17 / revFADP)";

/**
 * Erasure request (GDPR Art. 17). NOT a delete button: Swiss law obliges the
 * clinic to retain medical records for 10 years (see /regulation#instant-
 * deletion), so a human reconciles the two — this opens a tracked message
 * thread and alerts the clinicians.
 */
export async function POST() {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const uid = guard.session.user.id;

  try {
    const [thread] = await db
      .insert(threads)
      .values({ patientId: uid, subject: REQUEST_SUBJECT })
      .returning();
    await db.insert(threadMessages).values({
      threadId: thread.id,
      senderId: uid,
      body:
        "I request the deletion of my account and personal data under GDPR Art. 17 / the Swiss FADP. " +
        "I understand clinical records may be subject to the 10-year medical retention duty and ask " +
        "for deletion or anonymisation of everything not covered by it.",
    });
  } catch (err) {
    console.error("[api/account/deletion-request] failed:", err);
    return serviceUnavailable();
  }

  const adminEmails = getAdminEmails();
  if (adminEmails.length > 0) {
    runAfterResponse(async () => {
      await sendEmail({
        to: adminEmails,
        subject: `⚠ Deletion request — a patient invoked GDPR Art. 17 (${COMPANY.shortName})`,
        html: `<p>A patient has requested account deletion. Statutory response window applies (one month under GDPR Art. 12(3)).</p><p><a href="${PORTAL_URL}${ADMIN_ROUTES.messages}">Open messages</a></p>`,
      });
    }, "[api/account/deletion-request] admin alert failed:");
  }

  return NextResponse.json({ success: true });
}
