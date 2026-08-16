import { z } from "zod";
import { MESSAGE_BODY_MAX_LENGTH } from "@/lib/config/portal";
import { db } from "@/lib/db";
import { threads, threadMessages } from "@/lib/db/schema";
import { eq, and, isNull, ne, inArray } from "drizzle-orm";

/** Validates a message reply body (used for both patient and admin replies) */
export const replySchema = z.object({
  body: z.string().min(1).max(MESSAGE_BODY_MAX_LENGTH),
});

/**
 * Count threads that have at least one unread message for the given user.
 * "Unread" = message not sent by this user and readAt IS NULL.
 */
export async function getUnreadThreadCount(userId: string): Promise<number> {
  // Get all thread IDs relevant to this user
  const userThreads = await db.query.threads.findMany({
    where: eq(threads.patientId, userId),
    columns: { id: true },
  });

  if (userThreads.length === 0) return 0;

  const threadIds = userThreads.map((t) => t.id);

  const unread = await db.query.threadMessages.findMany({
    where: and(
      inArray(threadMessages.threadId, threadIds),
      ne(threadMessages.senderId, userId),
      isNull(threadMessages.readAt)
    ),
    columns: { threadId: true },
  });

  // Count distinct threads
  return new Set(unread.map((m) => m.threadId)).size;
}

/**
 * Count threads (across all patients) that have at least one unread message
 * sent by a patient (non-admin). Used for the admin nav badge.
 */
export async function getAdminUnreadThreadCount(): Promise<number> {
  const unreadThreadIds = await getAdminUnreadThreadIds();
  return unreadThreadIds.size;
}

/**
 * Return the set of thread IDs that have at least one unread patient message.
 * Used by the admin messages list to show per-thread unread indicators.
 */
export async function getAdminUnreadThreadIds(): Promise<Set<string>> {
  // "Sent by the patient" is the thread's OWN patient, not "anyone with
  // role=patient". A clinician who is also somebody's patient (which is how this
  // practice works by design) has role=admin, so the role test dropped their
  // messages from the badge entirely — the count silently undercounted exactly
  // the dual-role people the care_team model exists to support. Same rule as
  // getAdminUnreadPatientIds below; one definition, not two.
  const unread = await db
    .selectDistinct({ threadId: threadMessages.threadId })
    .from(threadMessages)
    .innerJoin(threads, eq(threadMessages.threadId, threads.id))
    .where(and(eq(threadMessages.senderId, threads.patientId), isNull(threadMessages.readAt)));

  return new Set(unread.map((r) => r.threadId));
}

/**
 * Threads whose newest message came from the patient — someone is sitting there
 * waiting for an answer.
 *
 * Deliberately NOT the same question as "unread". A message can be read and
 * still unanswered, and from the patient's side those are identical: they wrote
 * to their doctor and nothing came back. The inbox is built on this, the badge
 * on unread.
 */
export async function getThreadsAwaitingReply(): Promise<
  { id: string; patientId: string; subject: string; lastMessageAt: Date }[]
> {
  const rows = await db.query.threads.findMany({
    with: {
      messages: {
        orderBy: (m, { desc }) => [desc(m.createdAt)],
        limit: 1,
        columns: { senderId: true, createdAt: true },
      },
    },
    columns: { id: true, patientId: true, subject: true, lastMessageAt: true },
  });

  return rows
    .filter((t) => {
      const newest = t.messages[0];
      // A thread with no messages is waiting on nobody. A message whose sender
      // was deleted (senderId null) is not evidence the patient wrote last.
      return Boolean(newest?.senderId) && newest.senderId === t.patientId;
    })
    .map(({ id, patientId, subject, lastMessageAt }) => ({
      id,
      patientId,
      subject,
      lastMessageAt,
    }));
}

/**
 * Return the set of patient IDs that have sent at least one unread message.
 * Used by the admin patients list to show a per-row message indicator without
 * a separate round-trip per patient.
 */
export async function getAdminUnreadPatientIds(): Promise<Set<string>> {
  const unread = await db
    .selectDistinct({ patientId: threads.patientId })
    .from(threadMessages)
    .innerJoin(threads, eq(threadMessages.threadId, threads.id))
    .where(
      and(
        // Message was sent by the patient (not the admin replying)
        eq(threadMessages.senderId, threads.patientId),
        isNull(threadMessages.readAt)
      )
    );

  return new Set(unread.map((r) => r.patientId));
}
