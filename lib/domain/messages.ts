import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import {
  canRead,
  canWrite,
  unreadCount,
  visibleMessages,
  type Message,
  type Participant,
  type Thread,
} from "threadkit";
import { MESSAGE_BODY_MAX_LENGTH } from "@/lib/config/portal";
import { db } from "@/lib/db";
import { threads, threadMessages, threadParticipants } from "@/lib/db/schema";

/**
 * Messaging, on participation.
 *
 * Who may read a thread is membership in `thread_participants` — not a role,
 * not `threads.patient_id`. The rules themselves live in `threadkit` and are
 * NOT restated here: SQL is used only to narrow cheaply (which threads does
 * this actor belong to, which messages could possibly be unread), and the
 * package decides the actual answer. Two copies of an authorization rule is
 * how one of them ends up wrong.
 */

/** Validates a message body (used for both patient and clinician replies). */
export const replySchema = z.object({
  body: z.string().min(1).max(MESSAGE_BODY_MAX_LENGTH),
});

type ParticipantRow = typeof threadParticipants.$inferSelect;
type MessageRow = typeof threadMessages.$inferSelect;
type ThreadRow = typeof threads.$inferSelect;

function toParticipant(row: ParticipantRow): Participant {
  return {
    actorId: row.actorId,
    kind: row.kind,
    role: row.role ?? undefined,
    joinedAt: row.joinedAt,
    leftAt: row.leftAt,
    visibleFrom: row.visibleFrom,
    canWrite: row.canWrite,
    lastReadAt: row.lastReadAt,
  };
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    threadId: row.threadId,
    // author_actor_id is the SSOT; sender_id is the legacy column kept for its
    // erasure semantics. The fallback covers rows written before the backfill.
    authorId: row.authorActorId ?? row.senderId ?? "",
    body: row.body,
    createdAt: row.createdAt,
    generatedBy: row.generatedByModel ? { model: row.generatedByModel } : undefined,
  };
}

function toThread(row: ThreadRow, participants: ParticipantRow[]): Thread {
  return {
    id: row.id,
    subject: row.subject,
    createdAt: row.createdAt,
    participants: participants.map(toParticipant),
  };
}

/** Thread ids this actor currently participates in. The cheap narrowing query. */
async function participatingThreadIds(actorId: string): Promise<string[]> {
  const rows = await db
    .select({ threadId: threadParticipants.threadId })
    .from(threadParticipants)
    .where(and(eq(threadParticipants.actorId, actorId), isNull(threadParticipants.leftAt)));
  return rows.map((r) => r.threadId);
}

/**
 * Load a thread with everything needed to reason about it.
 * Returns null when the thread does not exist — say nothing about whether the
 * caller was allowed to know that; the route decides how to answer.
 */
export async function loadThread(
  threadId: string
): Promise<{ thread: Thread; messages: Message[]; row: ThreadRow } | null> {
  const [row, participantRows, messageRows] = await Promise.all([
    db.query.threads.findFirst({ where: eq(threads.id, threadId) }),
    db.query.threadParticipants.findMany({
      where: eq(threadParticipants.threadId, threadId),
    }),
    db.query.threadMessages.findMany({
      where: eq(threadMessages.threadId, threadId),
      orderBy: [asc(threadMessages.createdAt)],
    }),
  ]);

  if (!row) return null;
  return {
    thread: toThread(row, participantRows),
    messages: messageRows.map(toMessage),
    row,
  };
}

/**
 * A thread as this actor is allowed to see it, or null if they may not see it
 * at all. The only supported way for a route to read a thread.
 */
export async function getThreadForActor(
  threadId: string,
  actorId: string
): Promise<{ thread: Thread; messages: Message[]; row: ThreadRow } | null> {
  const loaded = await loadThread(threadId);
  if (!loaded) return null;
  if (!canRead(loaded.thread, actorId)) return null;
  return {
    thread: loaded.thread,
    messages: visibleMessages(loaded.thread, actorId, loaded.messages),
    row: loaded.row,
  };
}

/** Threads this actor participates in, newest activity first, with their own unread count. */
export async function listThreadsForActor(actorId: string): Promise<
  {
    thread: Thread;
    row: ThreadRow;
    latest: Message | undefined;
    unread: number;
  }[]
> {
  const ids = await participatingThreadIds(actorId);
  if (ids.length === 0) return [];

  const [threadRows, participantRows, messageRows] = await Promise.all([
    db.query.threads.findMany({
      where: inArray(threads.id, ids),
      orderBy: [desc(threads.lastMessageAt)],
    }),
    db.query.threadParticipants.findMany({
      where: inArray(threadParticipants.threadId, ids),
    }),
    db.query.threadMessages.findMany({
      where: inArray(threadMessages.threadId, ids),
      orderBy: [asc(threadMessages.createdAt)],
    }),
  ]);

  const participantsByThread = new Map<string, ParticipantRow[]>();
  for (const p of participantRows) {
    const list = participantsByThread.get(p.threadId) ?? [];
    list.push(p);
    participantsByThread.set(p.threadId, list);
  }

  const messagesByThread = new Map<string, Message[]>();
  for (const m of messageRows) {
    const list = messagesByThread.get(m.threadId) ?? [];
    list.push(toMessage(m));
    messagesByThread.set(m.threadId, list);
  }

  return threadRows.map((row) => {
    const thread = toThread(row, participantsByThread.get(row.id) ?? []);
    const all = messagesByThread.get(row.id) ?? [];
    const visible = visibleMessages(thread, actorId, all);
    return {
      thread,
      row,
      latest: visible[visible.length - 1],
      unread: unreadCount(thread, actorId, all),
    };
  });
}

/**
 * How many threads have something unread for this actor — the nav badge.
 *
 * One function for everyone. There is no separate admin variant any more,
 * because with participation an admin is simply another participant, and a
 * clinic-wide count was only ever meaningful while there was one clinician.
 */
export async function getUnreadThreadCount(actorId: string): Promise<number> {
  const entries = await listThreadsForActor(actorId);
  return entries.filter((e) => e.unread > 0).length;
}

/** Thread ids with at least one unread message for this actor. */
export async function getUnreadThreadIds(actorId: string): Promise<Set<string>> {
  const entries = await listThreadsForActor(actorId);
  return new Set(entries.filter((e) => e.unread > 0).map((e) => e.thread.id));
}

/** Patient ids whose threads have something unread for this actor. */
export async function getUnreadPatientIds(actorId: string): Promise<Set<string>> {
  const entries = await listThreadsForActor(actorId);
  return new Set(
    entries.filter((e) => e.unread > 0).map((e) => e.row.patientId)
  );
}

/**
 * Threads where the newest message this actor can see came from somebody else —
 * someone is sitting there waiting for an answer.
 *
 * Deliberately not the same question as "unread": a message can be read and
 * still unanswered, and from the patient's side those are identical.
 */
export async function getThreadsAwaitingReply(
  actorId: string
): Promise<{ id: string; patientId: string; subject: string; lastMessageAt: Date }[]> {
  const entries = await listThreadsForActor(actorId);
  return entries
    .filter((e) => e.latest !== undefined && e.latest.authorId !== actorId)
    .map((e) => ({
      id: e.row.id,
      patientId: e.row.patientId,
      subject: e.row.subject,
      lastMessageAt: e.row.lastMessageAt,
    }));
}

/** Move this actor's read high-water mark. Touches only their own row. */
export async function markThreadRead(
  threadId: string,
  actorId: string,
  at: Date = new Date()
): Promise<void> {
  await db
    .update(threadParticipants)
    .set({ lastReadAt: at })
    .where(
      and(
        eq(threadParticipants.threadId, threadId),
        eq(threadParticipants.actorId, actorId),
        // Never move a mark backwards: a stale tab finishing its request after a
        // newer one would otherwise resurrect messages the user has already read.
        or(isNull(threadParticipants.lastReadAt), lt(threadParticipants.lastReadAt, at))
      )
    );
}

export type PostMessageResult =
  | { ok: true; message: MessageRow }
  | { ok: false; reason: "not-found" | "forbidden" };

/**
 * Append a message, if this actor is allowed to speak here.
 *
 * The permission check is `canWrite`, which covers a non-participant, someone
 * who has left, and a participant explicitly muted (an observer, or a paused
 * assistant) — all of which a role check would wave through.
 */
export async function postMessage(input: {
  threadId: string;
  actorId: string;
  body: string;
  kind?: "human" | "ai" | "system";
  generatedByModel?: string;
  /** Set only for a human author, to keep the users FK meaningful for erasure. */
  senderId?: string | null;
}): Promise<PostMessageResult> {
  const loaded = await loadThread(input.threadId);
  if (!loaded) return { ok: false, reason: "not-found" };
  if (!canWrite(loaded.thread, input.actorId)) return { ok: false, reason: "forbidden" };

  const [message] = await db
    .insert(threadMessages)
    .values({
      threadId: input.threadId,
      senderId: input.senderId ?? null,
      authorActorId: input.actorId,
      authorKind: input.kind ?? "human",
      generatedByModel: input.generatedByModel ?? null,
      body: input.body,
    })
    .returning();

  await db
    .update(threads)
    .set({ lastMessageAt: new Date() })
    .where(eq(threads.id, input.threadId));

  return { ok: true, message };
}

/** Add someone to a thread. History is not granted unless asked for explicitly. */
export async function addParticipant(input: {
  threadId: string;
  actorId: string;
  kind?: "human" | "ai" | "system";
  role?: string;
  canWrite?: boolean;
  grantFullHistory?: boolean;
}): Promise<void> {
  const now = new Date();
  let visibleFrom = now;
  if (input.grantFullHistory) {
    const row = await db.query.threads.findFirst({
      where: eq(threads.id, input.threadId),
      columns: { createdAt: true },
    });
    if (row) visibleFrom = row.createdAt;
  }

  await db
    .insert(threadParticipants)
    .values({
      threadId: input.threadId,
      actorId: input.actorId,
      kind: input.kind ?? "human",
      role: input.role ?? null,
      canWrite: input.canWrite ?? true,
      joinedAt: now,
      visibleFrom,
    })
    .onConflictDoNothing();
}
