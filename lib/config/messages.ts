// Message/thread type definitions — SSOT for API-serialised shapes used across portal and admin

/** Domain labels for a thread participant. Never used to grant access — see lib/domain/messages.ts. */
export const PARTICIPANT_ROLE = {
  patient: "patient",
  clinician: "clinician",
  assistant: "assistant",
  observer: "observer",
} as const;

export type ParticipantRole = (typeof PARTICIPANT_ROLE)[keyof typeof PARTICIPANT_ROLE];

export type ActorKind = "human" | "ai" | "system";

/**
 * The clinician a thread is addressed to. Null for threads opened before
 * multi-clinician care, or by a patient nobody treats yet — the UI must say
 * something neutral rather than naming a clinician who isn't involved.
 */
export type ThreadClinician = { id: string; name: string | null } | null;

/** Someone (or something) taking part in a thread. */
export type ThreadParticipantView = {
  actorId: string;
  kind: ActorKind;
  role: string | null;
  /** Display label. Resolved server-side so naming lives in one place. */
  label: string;
  canWrite: boolean;
  hasLeft: boolean;
};

/**
 * A single message within a thread (API serialised — dates are strings).
 *
 * `mine` and `authorLabel` are resolved server-side, because with more than two
 * participants the client can no longer infer "me vs the clinic" from a role.
 */
export type MessageRow = {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
  authorLabel: string;
  authorKind: ActorKind;
  /** Set iff a model wrote this, so the UI can say so rather than implying a human did. */
  generatedByModel: string | null;
  /** Unread *for the requesting viewer* — read state is per person, never per message. */
  unreadForViewer: boolean;
  /**
   * For your own messages: has everyone else still in the thread read it?
   *
   * The two-party version of this was "the other person opened it". With a group
   * the only honest generalisation is *all* of them — "someone read it" would let
   * a tick appear while the person you were actually asking has not looked.
   */
  readByOthers: boolean;
};

/**
 * Thread list item returned by GET /api/messages.
 * `unread` is this viewer's own count.
 */
export type ThreadListItem = {
  id: string;
  subject: string;
  createdAt: string;
  lastMessageAt: string;
  patient: { id: string; name: string | null; email: string | null };
  clinician: ThreadClinician;
  unread: number;
  latest: { body: string; authorLabel: string; createdAt: string } | null;
};

/**
 * Full thread with messages, returned by GET /api/messages/[id].
 *
 * `patient` is always present: the endpoint answers only to participants, and a
 * patient reading their own thread learning their own name discloses nothing.
 * It carries id, name and email and nothing else — this is exactly the seam
 * where a whole users row, password hash included, escapes into a response.
 */
export type ThreadDetail = {
  id: string;
  subject: string;
  clinician: ThreadClinician;
  patient: { id: string; name: string | null; email: string | null };
  participants: ThreadParticipantView[];
  messages: MessageRow[];
};

/** Retained as an alias: the patient block is no longer admin-only. */
export type ThreadDetailWithPatient = ThreadDetail;
