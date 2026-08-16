/**
 * Reading somebody else's calendar.
 *
 * Every calendar app publishes a private "secret address in iCal format" URL.
 * Pointing at one is how a clinician's real life — a school run, a conference,
 * a dentist — stops VitaReBa from offering that hour to a patient, with no
 * OAuth application, no vendor lock, and nothing to pay. It is read-only by
 * construction: this file can block a slot and can never write to anyone's
 * calendar.
 *
 * WHAT THIS PARSER IS FOR, AND WHAT IT IS NOT.
 * It answers exactly one question: WHICH INTERVALS ARE BUSY. It does not need
 * titles, guests, or descriptions, and deliberately does not keep them —
 * a psychiatric clinic should not hold a mirror of its doctors' private lives
 * in its database in order to avoid double-booking them.
 *
 * The hard parts of iCalendar, and what is done about each:
 *  • Line folding — long lines are split with a leading space. Unfolded first,
 *    or every value past 75 octets is silently truncated.
 *  • Time zones — DTSTART;TZID=Europe/Zurich is wall-clock, not an instant.
 *    Resolved through the same converter the slot engine uses.
 *  • All-day events — VALUE=DATE has no time. Treated as the whole day in the
 *    clinic's zone, because "away on the 14th" means the 14th.
 *  • Recurrence — a weekly meeting is one VEVENT and dozens of busy hours.
 *    Expanded within the horizon only; expanding an unbounded rule to infinity
 *    is how a calendar parser becomes an outage.
 *  • Free time — TRANSP:TRANSPARENT and STATUS:CANCELLED mean the organiser is
 *    NOT busy. Honouring them is what keeps "out of office, available" from
 *    blocking a week.
 */

import { CLINIC_TIMEZONE } from "@/lib/config/company";
import { DAY_MS } from "@/lib/utils/format";
import { wallClockToUtc } from "@/lib/utils/timezone";

export type BusyInterval = { start: Date; end: Date };

/** Guards against a hostile or broken feed expanding without bound. */
export const MAX_EVENTS = 5_000;
export const MAX_OCCURRENCES_PER_RULE = 400;

// ─── Lexing ───────────────────────────────────────────────────────────────────

/**
 * Undo RFC 5545 line folding: a CRLF followed by a space or tab continues the
 * previous line. Done before anything else, because a folded DTSTART is a
 * DTSTART that parses to nothing.
 */
export function unfoldIcs(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += raw.slice(1);
    } else {
      lines.push(raw);
    }
  }
  return lines;
}

type Property = { name: string; params: Record<string, string>; value: string };

/** `DTSTART;TZID=Europe/Zurich:20260615T090000` → name, params, value. */
export function parseProperty(line: string): Property | null {
  const colon = indexOfUnquoted(line, ":");
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(";");
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    params[part.slice(0, eq).toUpperCase()] = stripQuotes(part.slice(eq + 1));
  }
  return { name: name.toUpperCase(), params, value };
}

/** A colon inside a quoted parameter (TZID="GMT+01:00") does not end the head. */
function indexOfUnquoted(line: string, ch: string): number {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ch && !quoted) return i;
  }
  return -1;
}

function stripQuotes(v: string): string {
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
}

// ─── Dates ────────────────────────────────────────────────────────────────────

export type IcsMoment = { at: Date; allDay: boolean };

/**
 * A DATE-TIME in any of the three forms iCalendar allows:
 *   20260615T090000Z            — UTC, unambiguous
 *   20260615T090000 (+TZID)     — wall clock in a named zone
 *   20260615        (VALUE=DATE)— a whole day
 *
 * A floating time with no TZID is read in the CLINIC's zone: the feed belongs
 * to a clinician working here, and reading it as UTC would shift their whole
 * calendar by an hour or two — quietly freeing hours they are not free.
 */
export function parseIcsDate(value: string, params: Record<string, string>): IcsMoment | null {
  const v = value.trim();

  if (params.VALUE === "DATE" || /^\d{8}$/.test(v)) {
    const iso = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
    const at = wallClockToUtc(iso, "00:00:00", params.TZID || CLINIC_TIMEZONE);
    return Number.isNaN(at.getTime()) ? null : { at, allDay: true };
  }

  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const iso = `${y}-${mo}-${d}`;
  const time = `${h}:${mi}:${s}`;
  const at = z
    ? new Date(`${iso}T${time}Z`)
    : wallClockToUtc(iso, time, params.TZID || CLINIC_TIMEZONE);
  return Number.isNaN(at.getTime()) ? null : { at, allDay: false };
}

/** ISO-8601 duration as used by DURATION: `PT1H30M`, `P1D`, `-PT15M`. */
export function parseIcsDuration(value: string): number | null {
  const m = value.trim().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [, sign, w, d, h, mi, s] = m;
  const ms =
    (Number(w ?? 0) * 7 + Number(d ?? 0)) * DAY_MS +
    Number(h ?? 0) * 3_600_000 +
    Number(mi ?? 0) * 60_000 +
    Number(s ?? 0) * 1_000;
  if (ms === 0 && !w && !d && !h && !mi && !s) return null;
  return sign === "-" ? -ms : ms;
}

// ─── Recurrence ───────────────────────────────────────────────────────────────

const WEEKDAY_INDEX: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

type Rrule = {
  freq: string;
  interval: number;
  count?: number;
  until?: Date;
  byDay: string[];
};

export function parseRrule(value: string): Rrule | null {
  const parts: Record<string, string> = {};
  for (const chunk of value.split(";")) {
    const eq = chunk.indexOf("=");
    if (eq > 0) parts[chunk.slice(0, eq).toUpperCase()] = chunk.slice(eq + 1);
  }
  if (!parts.FREQ) return null;
  const until = parts.UNTIL ? parseIcsDate(parts.UNTIL, {})?.at : undefined;
  return {
    freq: parts.FREQ.toUpperCase(),
    interval: Math.max(1, Number(parts.INTERVAL ?? 1) || 1),
    count: parts.COUNT ? Number(parts.COUNT) : undefined,
    until,
    // BYDAY can carry an ordinal ("2MO" = second Monday). The day is what
    // matters for whether the hour is busy; the ordinal only narrows it, and
    // ignoring it errs toward MORE busy time, which is the safe direction.
    byDay: (parts.BYDAY ?? "")
      .split(",")
      .map((d) => d.replace(/^[+-]?\d+/, "").toUpperCase())
      .filter((d) => d in WEEKDAY_INDEX),
  };
}

/**
 * Every start this rule produces inside [windowStart, windowEnd].
 *
 * Bounded twice — by the window and by MAX_OCCURRENCES_PER_RULE — because a
 * daily rule with no UNTIL is genuinely infinite and a calendar sync that tries
 * to enumerate it never returns.
 */
export function expandRecurrence(
  start: Date,
  rule: Rrule,
  windowStart: Date,
  windowEnd: Date
): Date[] {
  const out: Date[] = [];
  const hardEnd = Math.min(
    windowEnd.getTime(),
    rule.until ? rule.until.getTime() : Number.POSITIVE_INFINITY
  );

  const push = (d: Date) => {
    if (d.getTime() >= windowStart.getTime() && d.getTime() <= hardEnd) out.push(d);
  };

  // Weekly rules with BYDAY produce several starts per period; everything else
  // produces one. Stepping by period and fanning out per BYDAY covers both.
  let cursor = new Date(start);
  let emitted = 0;
  for (let i = 0; i < MAX_OCCURRENCES_PER_RULE; i++) {
    if (cursor.getTime() > hardEnd) break;

    if (rule.freq === "WEEKLY" && rule.byDay.length > 0) {
      const weekStart = cursor.getTime() - ((cursor.getUTCDay() - 1 + 7) % 7) * DAY_MS;
      for (const day of rule.byDay) {
        const offset = (WEEKDAY_INDEX[day] - 1 + 7) % 7;
        const at = new Date(weekStart + offset * DAY_MS);
        if (at.getTime() < start.getTime()) continue;
        push(at);
        emitted++;
        if (rule.count && emitted >= rule.count) return out;
      }
    } else {
      push(new Date(cursor));
      emitted++;
      if (rule.count && emitted >= rule.count) return out;
    }

    cursor = advance(cursor, rule);
    if (Number.isNaN(cursor.getTime())) break;
  }
  return out;
}

function advance(from: Date, rule: Rrule): Date {
  const next = new Date(from);
  switch (rule.freq) {
    case "DAILY":
      next.setUTCDate(next.getUTCDate() + rule.interval);
      return next;
    case "WEEKLY":
      next.setUTCDate(next.getUTCDate() + 7 * rule.interval);
      return next;
    case "MONTHLY":
      next.setUTCMonth(next.getUTCMonth() + rule.interval);
      return next;
    case "YEARLY":
      next.setUTCFullYear(next.getUTCFullYear() + rule.interval);
      return next;
    default:
      // An unsupported frequency must not loop forever pretending to work.
      return new Date(NaN);
  }
}

// ─── The whole feed ───────────────────────────────────────────────────────────

export type ParseOptions = {
  /** Only intervals overlapping this window are returned. */
  windowStart: Date;
  windowEnd: Date;
};

/**
 * Busy intervals from an iCalendar document, merged and sorted.
 *
 * Anything unparseable is skipped rather than throwing: a single malformed
 * event in a year of a real calendar must not cost the clinician every other
 * event in it.
 */
export function parseBusyIntervals(text: string, opts: ParseOptions): BusyInterval[] {
  const lines = unfoldIcs(text);
  const intervals: BusyInterval[] = [];

  let inEvent = false;
  let current: {
    start?: IcsMoment;
    end?: IcsMoment;
    duration?: number;
    rrule?: Rrule | null;
    exdates: number[];
    transparent: boolean;
    cancelled: boolean;
  } | null = null;

  const reset = () => ({
    exdates: [] as number[],
    transparent: false,
    cancelled: false,
    rrule: null as Rrule | null,
  });

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      current = reset();
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) collect(current, intervals, opts);
      inEvent = false;
      current = null;
      if (intervals.length > MAX_EVENTS) break;
      continue;
    }
    if (!inEvent || !current) continue;

    const prop = parseProperty(line);
    if (!prop) continue;

    switch (prop.name) {
      case "DTSTART":
        current.start = parseIcsDate(prop.value, prop.params) ?? undefined;
        break;
      case "DTEND":
        current.end = parseIcsDate(prop.value, prop.params) ?? undefined;
        break;
      case "DURATION":
        current.duration = parseIcsDuration(prop.value) ?? undefined;
        break;
      case "RRULE":
        current.rrule = parseRrule(prop.value);
        break;
      case "EXDATE":
        for (const v of prop.value.split(",")) {
          const d = parseIcsDate(v, prop.params);
          if (d) current.exdates.push(d.at.getTime());
        }
        break;
      case "TRANSP":
        // The organiser marked this time as free. Believe them.
        current.transparent = prop.value.trim().toUpperCase() === "TRANSPARENT";
        break;
      case "STATUS":
        current.cancelled = prop.value.trim().toUpperCase() === "CANCELLED";
        break;
    }
  }

  return mergeIntervals(intervals);
}

function collect(
  ev: {
    start?: IcsMoment;
    end?: IcsMoment;
    duration?: number;
    rrule?: Rrule | null;
    exdates: number[];
    transparent: boolean;
    cancelled: boolean;
  },
  out: BusyInterval[],
  opts: ParseOptions
): void {
  if (!ev.start || ev.transparent || ev.cancelled) return;

  // Length, in order of authority: an explicit end, a duration, then the
  // defaults RFC 5545 gives — a whole day for a DATE, and (unusually) zero for
  // a DATE-TIME, which we round up to nothing rather than inventing an hour.
  let lengthMs: number;
  if (ev.end) lengthMs = ev.end.at.getTime() - ev.start.at.getTime();
  else if (ev.duration !== undefined) lengthMs = ev.duration;
  else if (ev.start.allDay) lengthMs = DAY_MS;
  else lengthMs = 0;
  if (lengthMs <= 0) return;

  const starts = ev.rrule
    ? expandRecurrence(ev.start.at, ev.rrule, opts.windowStart, opts.windowEnd)
    : [ev.start.at];

  const excluded = new Set(ev.exdates);
  for (const s of starts) {
    if (excluded.has(s.getTime())) continue;
    const end = new Date(s.getTime() + lengthMs);
    // Overlap, not containment: a meeting that began yesterday and runs into
    // this morning still blocks this morning.
    if (end <= opts.windowStart || s >= opts.windowEnd) continue;
    out.push({ start: s, end });
  }
}

/**
 * Overlapping and touching intervals become one.
 *
 * Not cosmetic: a busy list is checked against every candidate slot, and a
 * calendar with a year of back-to-back meetings otherwise turns slot generation
 * into thousands of pointless comparisons per page load.
 */
export function mergeIntervals(intervals: BusyInterval[]): BusyInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  // A COPY of the first element, not the element: extending a merged interval
  // assigns to `last.end`, which would otherwise reach back through the array
  // and rewrite the caller's own object.
  const merged: BusyInterval[] = [{ ...sorted[0] }];
  for (const next of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (next.start.getTime() <= last.end.getTime()) {
      if (next.end.getTime() > last.end.getTime()) last.end = next.end;
    } else {
      merged.push({ ...next });
    }
  }
  return merged;
}
