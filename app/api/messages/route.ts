export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { threads, threadMessages, users } from "@/lib/db/schema";
import { MESSAGE_SUBJECT_MAX_LENGTH, MESSAGE_BODY_MAX_LENGTH } from "@/lib/config/portal";
import { USER_ROLE } from "@/lib/config/auth";
import { sendEmail } from "@/lib/email";
import { newMessageEmail } from "@/lib/email/templates";
import { COMPANY, PORTAL_URL, getAdminEmails } from "@/lib/config/company";
import { ADMIN_ROUTES, PORTAL_ROUTES } from "@/lib/config/routes";
import { runAfterResponse } from "@/lib/utils/post-response";
import { serviceUnavailable, badRequest } from "@/lib/utils/api-response";
import { displayName } from "@/lib/utils/format";
import {
  getClinicianById,
  getPrimaryClinicianId,
  type ClinicianContact,
} from "@/lib/domain/care-team";

const createSchema = z.object({
  subject: z.string().min(1).max(MESSAGE_SUBJECT_MAX_LENGTH),
  body: z.string().min(1).max(MESSAGE_BODY_MAX_LENGTH),
  patientId: z.string().uuid().optional(), // admin can open thread on behalf of patient
  clinicianId: z.string().uuid().optional(), // who the thread is addressed to
});

export async function GET() {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  const where =
    session.user.role === USER_ROLE.admin
      ? undefined
      : eq(threads.patientId, session.user.id);

  let results;
  try {
    results = await db.query.threads.findMany({
      where,
      orderBy: [desc(threads.lastMessageAt)],
      with: {
        patient: { columns: { id: true, name: true, email: true } },
        clinician: { columns: { id: true, name: true } },
        messages: { orderBy: [desc(threadMessages.createdAt)], limit: 1 },
      },
    });
  } catch (err) {
    console.error("[api/messages] GET failed:", err);
    return serviceUnavailable();
  }

  return NextResponse.json({ success: true, data: results });
}

export async function POST(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
  }

  const patientId =
    session.user.role === USER_ROLE.admin && parsed.data.patientId
      ? parsed.data.patientId
      : session.user.id;

  // Who the thread is addressed to: the explicit choice when given, otherwise
  // the patient's primary clinician. Stays null when nobody treats them yet —
  // those threads fall back to the admin mailbox, as they always did.
  let clinician: ClinicianContact | null = null;
  try {
    if (parsed.data.clinicianId) {
      clinician = await getClinicianById(parsed.data.clinicianId);
      if (!clinician) return badRequest("Unknown clinician");
    } else {
      const primaryId = await getPrimaryClinicianId(patientId);
      if (primaryId) clinician = await getClinicianById(primaryId);
    }
  } catch (err) {
    console.error("[api/messages] clinician lookup failed:", err);
    return serviceUnavailable();
  }

  let thread: typeof threads.$inferSelect;
  try {
    [thread] = await db
      .insert(threads)
      .values({ patientId, clinicianId: clinician?.id ?? null, subject: parsed.data.subject })
      .returning();
    await db.insert(threadMessages).values({
      threadId: thread.id,
      senderId: session.user.id,
      body: parsed.data.body,
    });
  } catch (err) {
    console.error("[api/messages] thread creation failed:", err);
    return NextResponse.json({ success: false, error: "Failed to send message — please try again" }, { status: 500 });
  }

  // Schedule notification work after the response so it is not dropped when the
  // request lifecycle ends.
  // An addressed thread reaches THAT clinician; only an unaddressed one falls
  // back to the whole admin mailbox.
  const clinicianName = clinician
    ? displayName(clinician.name, clinician.email)
    : COMPANY.clinicianFallback;
  const inboundRecipients = clinician ? [clinician.email] : getAdminEmails();
  if (session.user.role === USER_ROLE.admin) {
    runAfterResponse(async () => {
      const patient = await db.query.users.findFirst({
        where: eq(users.id, patientId),
        columns: { name: true, email: true },
      });
      if (!patient?.email) return;
      await sendEmail({
        to: patient.email,
        subject: `New message: ${parsed.data.subject} — ${COMPANY.shortName}`,
        html: newMessageEmail({
          recipientName: displayName(patient.name, patient.email),
          senderName: clinicianName,
          subject: parsed.data.subject,
          portalUrl: `${PORTAL_URL}${PORTAL_ROUTES.messages}/${thread.id}`,
        }),
      });
    }, "[api/messages] patient notification failed:");
  } else if (inboundRecipients.length > 0) {
    runAfterResponse(async () => {
      const patient = await db.query.users.findFirst({
        where: eq(users.id, session.user.id),
        columns: { name: true, email: true },
      });
      await sendEmail({
        to: inboundRecipients,
        subject: `New message from ${displayName(patient?.name, patient?.email)}: ${parsed.data.subject}`,
        html: newMessageEmail({
          recipientName: clinicianName,
          senderName: displayName(patient?.name, patient?.email),
          subject: parsed.data.subject,
          portalUrl: `${PORTAL_URL}${ADMIN_ROUTES.messages}/${thread.id}`,
        }),
      });
    }, "[api/messages] admin notification failed:");
  }

  return NextResponse.json({ success: true, data: thread }, { status: 201 });
}
