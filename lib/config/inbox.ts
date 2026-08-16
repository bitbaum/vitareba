/**
 * SSOT for the clinical inbox — the first screen a clinician sees.
 *
 * The product's stated goal is that Manuel opens the admin and knows, without
 * calling anyone, exactly who needs attention today. A patient list sorted by a
 * badge is not that: it answers "how is everyone", when the question at 08:00 on
 * a Tuesday is "what is waiting for me".
 *
 * The ordering below is the whole design. Sections are read top to bottom and
 * the top is reserved for things that should not wait until the next
 * appointment. Anything routine placed above something urgent trains the reader
 * to scroll past the urgent one.
 */

export const INBOX_SECTION_KEYS = [
  "results",
  "critical",
  "messages",
  "bookings",
  "attention",
] as const;

export type InboxSectionKey = (typeof INBOX_SECTION_KEYS)[number];

/**
 * How loudly a section is allowed to shout.
 *  urgent    — should not wait for the next appointment
 *  attention — someone is waiting on us to do something
 *  routine   — worth a look this week
 */
export type InboxTone = "urgent" | "attention" | "routine";

export type InboxSectionDef = {
  key: InboxSectionKey;
  label: string;
  tone: InboxTone;
  /** Shown when the section is empty, in a sentence rather than a dash. */
  empty: string;
};

export const INBOX_SECTIONS: readonly InboxSectionDef[] = [
  {
    key: "results",
    label: "Results to review",
    tone: "urgent",
    empty: "No result is outside the range that can wait.",
  },
  {
    key: "critical",
    label: "Patients to contact",
    tone: "urgent",
    empty: "No patient is showing a critical signal.",
  },
  {
    key: "messages",
    label: "Waiting on a reply",
    tone: "attention",
    empty: "Every message has been answered.",
  },
  {
    key: "bookings",
    label: "Bookings to confirm",
    tone: "attention",
    empty: "No booking is waiting for confirmation.",
  },
  {
    key: "attention",
    label: "Next steps",
    tone: "routine",
    empty: "Nobody is stuck without a next step.",
  },
];

/**
 * Hours after which an unanswered patient message is called out as overdue.
 * Not a promise of a reply time — a reminder that a person is waiting, and the
 * clock they feel starts when they press send, not when we open the tab.
 */
export const MESSAGE_OVERDUE_HOURS = 24;

/**
 * How far back a measured value can be and still be called "to review".
 *
 * A blood pressure of 186 taken this week is today's problem. The same reading
 * from eighteen months ago is history, and putting it at the top of the screen
 * every morning is how a clinician learns to ignore the top of the screen. If it
 * is still the newest value after this long, the thing that needs booking is a
 * repeat measurement, not an alert.
 */
export const RESULT_REVIEW_WINDOW_DAYS = 180;

/**
 * Most items rendered per section. A list nobody can finish reading is a list
 * nobody starts; the remainder is counted, never silently dropped.
 */
export const INBOX_SECTION_LIMIT = 8;
