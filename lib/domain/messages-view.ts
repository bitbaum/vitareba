import { inArray } from "drizzle-orm";
import { readersOf, unreadMessages, type Message, type Thread } from "threadkit";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { COMPANY } from "@/lib/config/company";
import {
  PARTICIPANT_ROLE,
  type MessageRow,
  type ThreadDetail,
  type ThreadListItem,
  type ThreadParticipantView,
} from "@/lib/config/messages";

/**
 * Turning domain objects into what the client sees.
 *
 * Labels are resolved here rather than in the browser because with more than
 * two participants a client can no longer infer "me versus the clinic" from a
 * role — and because the alternative is every page inventing its own naming.
 */

/** Human-readable name for an actor, given whatever we know about them. */
type ActorInfo = { name: string | null; email: string | null };

function labelFor(
  actorId: string,
  kind: string,
  role: string | null,
  names: Map<string, ActorInfo>,
): string {
  if (kind === "ai") return COMPANY.assistantName;
  const name = names.get(actorId)?.name;
  if (name) return name;
  if (role === PARTICIPANT_ROLE.clinician) return `${COMPANY.shortName} team`;
  if (role === PARTICIPANT_ROLE.patient) return "Patient";
  return "Unknown";
}

/**
 * Details for the human actors in these threads. AI actors have no users row by
 * design, so they are simply absent from the map.
 *
 * Columns are named explicitly rather than selecting the row: this table holds
 * password hashes, and a serialiser is exactly where one escapes into a
 * response.
 */
async function nameLookup(actorIds: string[]): Promise<Map<string, ActorInfo>> {
  if (actorIds.length === 0) return new Map();
  const rows = await db.query.users.findMany({
    where: inArray(users.id, actorIds),
    columns: { id: true, name: true, email: true },
  });
  return new Map(rows.map((r) => [r.id, { name: r.name, email: r.email }]));
}

export async function serializeThread(
  thread: Thread,
  messages: Message[],
  viewerId: string,
  row: { patientId: string },
): Promise<ThreadDetail> {
  const humanIds = [
    ...new Set([
      ...thread.participants.filter((p) => p.kind === "human").map((p) => p.actorId),
      // Legacy threads may predate the participants table for the patient.
      row.patientId,
    ]),
  ];
  const names = await nameLookup(humanIds);

  // Unread comes from threadkit so the badge and the message list can never
  // disagree about what "unread" means.
  const unreadIds = new Set(unreadMessages(thread, viewerId, messages).map((m) => m.id));

  const participants: ThreadParticipantView[] = thread.participants.map((p) => ({
    actorId: p.actorId,
    kind: p.kind,
    role: p.role ?? null,
    label: labelFor(p.actorId, p.kind, p.role ?? null, names),
    canWrite: p.canWrite !== false,
    hasLeft: Boolean(p.leftAt),
  }));

  const byActor = new Map(thread.participants.map((p) => [p.actorId, p]));

  // Everyone still in the thread who is not the viewer — the audience a "read"
  // tick is a claim about.
  const otherActiveHumans = thread.participants.filter(
    (p) => p.actorId !== viewerId && p.kind === "human" && !p.leftAt,
  ).length;

  const rows: MessageRow[] = messages.map((m) => {
    const author = byActor.get(m.authorId);
    // Only people count toward a read tick: an assistant having "seen" a
    // message says nothing about whether the human you asked has.
    const readers =
      m.authorId === viewerId
        ? readersOf(thread, m).filter((p) => p.kind === "human" && !p.leftAt).length
        : 0;
    return {
      readByOthers: otherActiveHumans > 0 && readers >= otherActiveHumans,
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      mine: m.authorId === viewerId,
      authorLabel: labelFor(m.authorId, author?.kind ?? "human", author?.role ?? null, names),
      authorKind: author?.kind ?? "human",
      generatedByModel: m.generatedBy?.model ?? null,
      unreadForViewer: unreadIds.has(m.id),
    };
  });

  return {
    id: thread.id,
    subject: thread.subject ?? "",
    // Kept for the existing header copy: the clinician participant, if there is one.
    clinician: (() => {
      const c = thread.participants.find((p) => p.role === PARTICIPANT_ROLE.clinician);
      return c ? { id: c.actorId, name: names.get(c.actorId)?.name ?? null } : null;
    })(),
    patient: {
      id: row.patientId,
      name: names.get(row.patientId)?.name ?? null,
      email: names.get(row.patientId)?.email ?? null,
    },
    participants,
    messages: rows,
  };
}

/**
 * The thread list, as one viewer sees it.
 *
 * `unread` is that viewer's own count — with participation there is no such
 * thing as a clinic-wide unread number, because two clinicians in the same
 * thread genuinely have different answers.
 */
export async function serializeThreadList(
  entries: {
    thread: Thread;
    row: { id: string; patientId: string; subject: string; createdAt: Date; lastMessageAt: Date };
    latest: Message | undefined;
    unread: number;
  }[],
): Promise<ThreadListItem[]> {
  const humanIds = [
    ...new Set([
      ...entries.flatMap((e) =>
        e.thread.participants.filter((p) => p.kind === "human").map((p) => p.actorId),
      ),
      // The patient a thread is about may not be a participant on legacy rows.
      ...entries.map((e) => e.row.patientId),
    ]),
  ];
  const names = await nameLookup(humanIds);

  return entries.map((e) => {
    const byActor = new Map(e.thread.participants.map((p) => [p.actorId, p]));
    const clinician = e.thread.participants.find((p) => p.role === PARTICIPANT_ROLE.clinician);
    const author = e.latest ? byActor.get(e.latest.authorId) : undefined;

    return {
      id: e.row.id,
      subject: e.row.subject,
      createdAt: e.row.createdAt.toISOString(),
      lastMessageAt: e.row.lastMessageAt.toISOString(),
      patient: {
        id: e.row.patientId,
        name: names.get(e.row.patientId)?.name ?? null,
        email: names.get(e.row.patientId)?.email ?? null,
      },
      clinician: clinician
        ? { id: clinician.actorId, name: names.get(clinician.actorId)?.name ?? null }
        : null,
      unread: e.unread,
      latest: e.latest
        ? {
            body: e.latest.body,
            authorLabel: labelFor(
              e.latest.authorId,
              author?.kind ?? "human",
              author?.role ?? null,
              names,
            ),
            createdAt: e.latest.createdAt.toISOString(),
          }
        : null,
    };
  });
}
