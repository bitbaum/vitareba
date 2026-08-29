/**
 * iCalendar (RFC 5545) generation — the vendor-neutral way to put an
 * appointment into somebody's calendar. Google, Apple, Outlook and every
 * CalDAV client read this format, so the clinic needs no OAuth app, no
 * per-provider integration, and no paid scheduling SaaS:
 *
 *   • booking emails carry a .ics attachment  → one tap adds the appointment
 *   • each clinician gets a subscribable feed → their calendar stays in sync
 *
 * Pure string building, no I/O — unit-testable.
 */

const CRLF = "\r\n";

/** RFC 5545 §3.3.5 — UTC timestamp form: 20260814T093000Z */
export function toIcsUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** RFC 5545 §3.3.11 — backslash, semicolon, comma and newline are special. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * RFC 5545 §3.1 — content lines are folded at 75 octets. Folding by UTF-16
 * length would split multi-byte characters (Zürich, Müller) mid-sequence and
 * some clients then reject the whole calendar, so measure in real bytes.
 */
export function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never cut inside a UTF-8 sequence: continuation bytes are 10xxxxxx.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74; // continuation lines carry a leading space
  }
  return parts.join(`${CRLF} `);
}

export type IcsEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  organizer?: { name?: string | null; email: string };
  attendees?: { name?: string | null; email: string }[];
  /** Bump on every change so calendars update the existing entry instead of duplicating it. */
  sequence?: number;
  cancelled?: boolean;
  /** Stamp of "now" — injected so output is deterministic in tests. */
  now?: Date;
};

function contactLine(
  prop: "ORGANIZER" | "ATTENDEE",
  c: { name?: string | null; email: string },
): string {
  const cn = c.name ? `;CN=${escapeIcsText(c.name)}` : "";
  return `${prop}${cn}:mailto:${c.email}`;
}

function eventLines(event: IcsEvent): string[] {
  const stamp = toIcsUtc(event.now ?? event.start);
  const lines = [
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toIcsUtc(event.start)}`,
    `DTEND:${toIcsUtc(event.end)}`,
    `SUMMARY:${escapeIcsText(event.summary)}`,
    `SEQUENCE:${event.sequence ?? 0}`,
    `STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  if (event.organizer) lines.push(contactLine("ORGANIZER", event.organizer));
  for (const a of event.attendees ?? []) lines.push(contactLine("ATTENDEE", a));
  lines.push("END:VEVENT");
  return lines;
}

function wrapCalendar(inner: string[], extraHeaders: string[] = []): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vita//Patient Portal//EN",
    "CALSCALE:GREGORIAN",
    ...extraHeaders,
    ...inner,
    "END:VCALENDAR",
  ]
    .map(foldIcsLine)
    .join(CRLF)
    .concat(CRLF);
}

/**
 * A single appointment as a mail attachment. METHOD:REQUEST is what makes
 * mail clients render the "Add to calendar / Accept" affordance rather than
 * treating the file as an anonymous download.
 */
export function buildIcsInvite(event: IcsEvent): string {
  return wrapCalendar(eventLines(event), [event.cancelled ? "METHOD:CANCEL" : "METHOD:REQUEST"]);
}

/**
 * A whole calendar for subscription. No METHOD (that would make it an
 * itinerary rather than a feed); REFRESH-INTERVAL asks clients to re-poll,
 * which is how "my calendar stays in sync" happens without any webhook.
 */
export function buildIcsFeed(events: IcsEvent[], calendarName: string): string {
  return wrapCalendar(events.flatMap(eventLines), [
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    "X-PUBLISHED-TTL:PT15M",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
  ]);
}
