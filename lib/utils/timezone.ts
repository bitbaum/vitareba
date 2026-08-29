/**
 * Wall-clock time in a named zone → the actual instant it refers to.
 *
 * "09:00 on Tuesday" is not a moment until you say where. The slot engine needs
 * this for the clinic's own hours, and the calendar parser needs it for whatever
 * zone somebody's Google or Apple calendar happens to be written in — the same
 * problem, so the same function, rather than two implementations that disagree
 * on the one Sunday in March when it matters.
 */

import { HOUR_MS } from "@/lib/utils/format";

const MINUTE_MS = 60 * 1000;

/** Formatters are expensive to build and are asked the same question constantly. */
const OFFSET_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function offsetFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = OFFSET_FORMATTERS.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" });
    OFFSET_FORMATTERS.set(timeZone, fmt);
  }
  return fmt;
}

/**
 * UTC offset of `timeZone` at a given instant, in milliseconds.
 * Returns 0 for a zone the runtime does not recognise — a calendar naming a zone
 * we cannot resolve should land its events an hour or two out, not vanish.
 */
export function zoneOffsetMs(at: Date, timeZone: string): number {
  let name: string;
  try {
    name =
      offsetFormatter(timeZone)
        .formatToParts(at)
        .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  } catch {
    return 0;
  }
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0; // exactly "GMT" means UTC
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * HOUR_MS + Number(m[3]) * MINUTE_MS);
}

/**
 * Convert a wall-clock date and time in `timeZone` to a UTC instant.
 *
 * Two passes: guess using the offset at the naive instant, then correct using
 * the offset at that guess. One pass is wrong for roughly half the year in any
 * zone with daylight saving — the naive instant can sit on the other side of a
 * transition from the moment it actually names. The remaining ambiguity is the
 * hour that repeats or disappears at a transition; both plausible answers are
 * within an hour, which is the correct amount of precision to have about a time
 * that genuinely happened twice.
 */
export function wallClockToUtc(dateISO: string, time: string, timeZone: string): Date {
  const naive = new Date(`${dateISO}T${time}Z`);
  const guess = new Date(naive.getTime() - zoneOffsetMs(naive, timeZone));
  return new Date(naive.getTime() - zoneOffsetMs(guess, timeZone));
}

/** Whether the runtime can resolve this IANA zone name at all. */
export function isKnownTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
