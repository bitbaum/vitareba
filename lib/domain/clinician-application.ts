/**
 * Becoming a clinician is not a signup checkbox — every account starts as a
 * patient (users.isClinician defaults to false), and this is the only path
 * that flips it. An admin approves or declines; nobody grants it to
 * themselves.
 */

import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clinicianApplications, users } from "@/lib/db/schema";
import {
  CLINICIAN_APPLICATION_MESSAGE_MAX_LENGTH,
  CLINICIAN_APPLICATION_REVIEW_NOTE_MAX_LENGTH,
} from "@/lib/config/portal";

export const submitApplicationSchema = z.object({
  message: z.string().trim().min(1).max(CLINICIAN_APPLICATION_MESSAGE_MAX_LENGTH),
});

export type ApplicationResult = { ok: true; id: string } | { ok: false; error: string };

export type ApplicationRow = {
  id: string;
  status: "pending" | "approved" | "declined";
  message: string;
  reviewNote: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
};

/** The applicant's own latest application, for their profile page — one status to show, not a history. */
export async function getOwnLatestApplication(userId: string): Promise<ApplicationRow | null> {
  const row = await db.query.clinicianApplications.findFirst({
    where: eq(clinicianApplications.userId, userId),
    orderBy: [desc(clinicianApplications.createdAt)],
  });
  return row ?? null;
}

/**
 * Already a clinician, or already has a pending application — either way there
 * is nothing new to submit. A DECLINED applicant may re-apply (a second
 * message, a fresh review); a second PENDING one from the same person would
 * just be noise in the queue.
 */
export async function submitApplication(userId: string, message: string): Promise<ApplicationResult> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { isClinician: true },
  });
  if (user?.isClinician) return { ok: false, error: "You are already a clinician." };

  const pending = await db.query.clinicianApplications.findFirst({
    where: and(eq(clinicianApplications.userId, userId), eq(clinicianApplications.status, "pending")),
    columns: { id: true },
  });
  if (pending) return { ok: false, error: "Your application is already pending review." };

  const [row] = await db.insert(clinicianApplications).values({ userId, message }).returning({ id: clinicianApplications.id });
  return { ok: true, id: row.id };
}

/** Every application, newest first — the admin review queue. */
export async function getApplicationQueue() {
  return db.query.clinicianApplications.findMany({
    orderBy: [desc(clinicianApplications.createdAt)],
    with: { user: { columns: { id: true, name: true, email: true, createdAt: true } } },
  });
}

async function loadPending(applicationId: string) {
  return db.query.clinicianApplications.findFirst({
    where: and(eq(clinicianApplications.id, applicationId), eq(clinicianApplications.status, "pending")),
  });
}

/** Grants isClinician. Does NOT create a clinician_profiles row — that stays lazy, same as every other clinician's settings. */
export async function approveApplication(
  applicationId: string,
  adminId: string
): Promise<ApplicationResult> {
  const application = await loadPending(applicationId);
  if (!application) return { ok: false, error: "Application not found or already decided." };

  await db.transaction(async (tx) => {
    await tx.update(users).set({ isClinician: true }).where(eq(users.id, application.userId));
    await tx
      .update(clinicianApplications)
      .set({ status: "approved", reviewedBy: adminId, reviewedAt: new Date() })
      .where(eq(clinicianApplications.id, applicationId));
  });

  return { ok: true, id: applicationId };
}

export async function declineApplication(
  applicationId: string,
  adminId: string,
  note: string | null
): Promise<ApplicationResult> {
  const application = await loadPending(applicationId);
  if (!application) return { ok: false, error: "Application not found or already decided." };

  await db
    .update(clinicianApplications)
    .set({ status: "declined", reviewedBy: adminId, reviewedAt: new Date(), reviewNote: note })
    .where(eq(clinicianApplications.id, applicationId));

  return { ok: true, id: applicationId };
}

export const reviewApplicationSchema = z.object({
  decision: z.enum(["approve", "decline"]),
  note: z.string().trim().max(CLINICIAN_APPLICATION_REVIEW_NOTE_MAX_LENGTH).optional(),
});
