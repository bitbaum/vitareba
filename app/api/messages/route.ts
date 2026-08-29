export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { threads, users } from "@/lib/db/schema";
import { MESSAGE_SUBJECT_MAX_LENGTH, MESSAGE_BODY_MAX_LENGTH } from "@/lib/config/portal";
import { USER_ROLE } from "@/lib/config/auth";
import { PARTICIPANT_ROLE } from "@/lib/config/messages";
import { runAfterResponse } from "@/lib/utils/post-response";
import { serviceUnavailable, badRequest } from "@/lib/utils/api-response";
import { addParticipant, listThreadsForActor, postMessage } from "@/lib/domain/messages";
import { serializeThreadList } from "@/lib/domain/messages-view";
import { notifyThreadParticipants } from "@/lib/domain/message-notifications";
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
  const actorId = guard.session.user.id;

  // No role branch and no unfiltered query: you get the threads you are in.
  // The previous version ran `where: undefined` for admins, which returned
  // every thread in the clinic — right while there was one clinician, and a
  // disclosure the moment there were two.
  try {
    const entries = await listThreadsForActor(actorId);
    return NextResponse.json({
      success: true,
      data: await serializeThreadList(entries),
    });
  } catch (err) {
    console.error("[api/messages] GET failed:", err);
    return serviceUnavailable();
  }
}

export async function POST(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;
  const actorId = session.user.id;
  const isAdmin = session.user.role === USER_ROLE.admin;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
  }

  const patientId = isAdmin && parsed.data.patientId ? parsed.data.patientId : actorId;

  // Who the thread is addressed to: the explicit choice when given, otherwise
  // the patient's primary clinician. Null when nobody treats them yet.
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

    await addParticipant({
      threadId: thread.id,
      actorId: patientId,
      role: PARTICIPANT_ROLE.patient,
    });

    if (clinician) {
      await addParticipant({
        threadId: thread.id,
        actorId: clinician.id,
        role: PARTICIPANT_ROLE.clinician,
      });
    } else {
      // Nobody treats this patient yet. The thread used to fall back to the
      // whole admin mailbox, so the clinic could still answer — participants
      // must reproduce that, or the patient writes into a void.
      const admins = await db.query.users.findMany({
        where: eq(users.role, USER_ROLE.admin),
        columns: { id: true },
      });
      for (const a of admins) {
        await addParticipant({
          threadId: thread.id,
          actorId: a.id,
          role: PARTICIPANT_ROLE.clinician,
        });
      }
    }

    // The author must be able to speak in the thread they just opened — an
    // admin writing on behalf of a patient treated by someone else would
    // otherwise be refused by their own endpoint.
    await addParticipant({
      threadId: thread.id,
      actorId,
      role: isAdmin ? PARTICIPANT_ROLE.clinician : PARTICIPANT_ROLE.patient,
    });

    const posted = await postMessage({
      threadId: thread.id,
      actorId,
      body: parsed.data.body,
      senderId: actorId,
    });
    if (!posted.ok) throw new Error(`first message rejected: ${posted.reason}`);
  } catch (err) {
    console.error("[api/messages] thread creation failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to send message — please try again" },
      { status: 500 },
    );
  }

  runAfterResponse(
    () => notifyThreadParticipants(thread.id, actorId),
    "[api/messages] notification failed:",
  );

  return NextResponse.json({ success: true, data: thread }, { status: 201 });
}
