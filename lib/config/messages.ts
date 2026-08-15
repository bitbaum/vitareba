// Message/thread type definitions — SSOT for API-serialised shapes used across portal and admin

/**
 * The clinician a thread is addressed to. Null for threads opened before
 * multi-clinician care, or by a patient nobody treats yet — the UI must say
 * something neutral rather than naming a clinician who isn't involved.
 */
export type ThreadClinician = { id: string; name: string | null } | null;

/** A single message within a thread (API serialised — dates are strings) */
export type MessageRow = {
  id: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  sender: { id: string; name: string | null; role: string };
};

/**
 * Thread list item returned by GET /api/messages.
 * Includes a preview of the latest message (body + readAt) for unread indicators.
 */
export type ThreadListItem = {
  id: string;
  subject: string;
  createdAt: string;
  lastMessageAt: string;
  patient: { id: string };
  clinician: ThreadClinician;
  // senderId is null when the sender's account was deleted — the message text
  // survives in the patient's record without an author.
  messages: { body: string; senderId: string | null; readAt: string | null }[];
};

/** Full thread with messages, returned by GET /api/messages/[id] (portal view) */
export type ThreadDetail = {
  id: string;
  subject: string;
  clinician: ThreadClinician;
  messages: MessageRow[];
};

/** ThreadDetail with patient info — admin-only endpoints include this extra field */
export type ThreadDetailWithPatient = ThreadDetail & {
  patient: { id: string; name: string | null; email: string };
};
