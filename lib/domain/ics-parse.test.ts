/**
 * Reading a real calendar, with real calendars' habits.
 *
 * The failure that matters here is ASYMMETRIC. A busy hour we miss gets offered
 * to a patient who then arrives to find nobody there. A busy hour we invent
 * only costs an unbooked slot. So where this parser is unsure, it errs toward
 * busy — and these tests pin the cases where being unsure is likely: folded
 * lines, floating times, all-day events, recurrence, and the two properties
 * that legitimately mean "free".
 */
/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import {
  expandRecurrence,
  mergeIntervals,
  parseBusyIntervals,
  parseIcsDate,
  parseIcsDuration,
  parseProperty,
  parseRrule,
  unfoldIcs,
} from "./ics-parse";
import { DAY_MS } from "@/lib/utils/format";

const WINDOW = {
  windowStart: new Date("2026-06-01T00:00:00Z"),
  windowEnd: new Date("2026-08-01T00:00:00Z"),
};

const wrap = (body: string) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", body, "END:VCALENDAR"].join("\r\n");

const event = (lines: string[]) => wrap(["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n"));

describe("unfolding", () => {
  it("rejoins a folded line", () => {
    // A folded DTSTART is a DTSTART that parses to nothing, and the event
    // silently disappears from the busy list.
    const lines = unfoldIcs("DTSTART:2026\r\n 0615T090000Z");
    expect(lines).toEqual(["DTSTART:20260615T090000Z"]);
  });

  it("treats a tab continuation the same as a space", () => {
    expect(unfoldIcs("SUMMARY:Long\r\n\ttitle")).toEqual(["SUMMARY:Longtitle"]);
  });

  it("handles bare LF and CRLF alike", () => {
    expect(unfoldIcs("A:1\nB:2")).toEqual(["A:1", "B:2"]);
  });
});

describe("property parsing", () => {
  it("splits name, parameters and value", () => {
    const p = parseProperty("DTSTART;TZID=Europe/Zurich:20260615T090000")!;
    expect(p.name).toBe("DTSTART");
    expect(p.params.TZID).toBe("Europe/Zurich");
    expect(p.value).toBe("20260615T090000");
  });

  it("does not end the head on a colon inside a quoted parameter", () => {
    // TZID="GMT+01:00" is legal and breaks a naive indexOf(":").
    const p = parseProperty('DTSTART;TZID="GMT+01:00":20260615T090000')!;
    expect(p.params.TZID).toBe("GMT+01:00");
    expect(p.value).toBe("20260615T090000");
  });

  it("returns null for a line that is not a property", () => {
    expect(parseProperty("nonsense")).toBeNull();
  });
});

describe("dates", () => {
  it("reads a UTC date-time exactly", () => {
    expect(parseIcsDate("20260615T090000Z", {})!.at.toISOString()).toBe("2026-06-15T09:00:00.000Z");
  });

  it("reads a zoned wall-clock time through its zone", () => {
    // 09:00 in Zürich in June is 07:00 UTC. Reading it as UTC would free two
    // hours the clinician is not free.
    const at = parseIcsDate("20260615T090000", { TZID: "Europe/Zurich" })!.at;
    expect(at.toISOString()).toBe("2026-06-15T07:00:00.000Z");
  });

  it("reads a floating time in the clinic's zone, not UTC", () => {
    const at = parseIcsDate("20260615T090000", {})!.at;
    expect(at.toISOString()).toBe("2026-06-15T07:00:00.000Z");
  });

  it("respects daylight saving on the other side of the year", () => {
    // 09:00 in Zürich in January is 08:00 UTC — one hour, not two.
    const at = parseIcsDate("20260115T090000", { TZID: "Europe/Zurich" })!.at;
    expect(at.toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });

  it("reads an all-day date and marks it as one", () => {
    const m = parseIcsDate("20260615", { VALUE: "DATE" })!;
    expect(m.allDay).toBe(true);
  });

  it("survives a zone the runtime has never heard of", () => {
    const m = parseIcsDate("20260615T090000", { TZID: "Mars/Olympus_Mons" });
    expect(m).not.toBeNull();
  });

  it("returns null for junk rather than an Invalid Date", () => {
    expect(parseIcsDate("tomorrow", {})).toBeNull();
    expect(parseIcsDate("", {})).toBeNull();
  });
});

describe("durations", () => {
  it("reads hours and minutes", () => {
    expect(parseIcsDuration("PT1H30M")).toBe(90 * 60_000);
  });

  it("reads days and weeks", () => {
    expect(parseIcsDuration("P1D")).toBe(DAY_MS);
    expect(parseIcsDuration("P2W")).toBe(14 * DAY_MS);
  });

  it("reads a negative duration", () => {
    expect(parseIcsDuration("-PT15M")).toBe(-15 * 60_000);
  });

  it("returns null for nonsense", () => {
    expect(parseIcsDuration("PT")).toBeNull();
    expect(parseIcsDuration("soon")).toBeNull();
  });
});

describe("single events", () => {
  it("takes a plain event as busy", () => {
    const busy = parseBusyIntervals(
      event(["DTSTART:20260615T090000Z", "DTEND:20260615T100000Z"]),
      WINDOW,
    );
    expect(busy).toHaveLength(1);
    expect(busy[0].start.toISOString()).toBe("2026-06-15T09:00:00.000Z");
    expect(busy[0].end.toISOString()).toBe("2026-06-15T10:00:00.000Z");
  });

  it("uses DURATION when there is no DTEND", () => {
    const busy = parseBusyIntervals(event(["DTSTART:20260615T090000Z", "DURATION:PT45M"]), WINDOW);
    expect(busy[0].end.toISOString()).toBe("2026-06-15T09:45:00.000Z");
  });

  it("blocks a whole day for an all-day event", () => {
    // "Away on the 14th" means the 14th, not a zero-length moment at midnight.
    const busy = parseBusyIntervals(event(["DTSTART;VALUE=DATE:20260615"]), WINDOW);
    expect(busy).toHaveLength(1);
    expect(busy[0].end.getTime() - busy[0].start.getTime()).toBe(DAY_MS);
  });

  it("ignores an event the organiser marked as free time", () => {
    // TRANSP:TRANSPARENT is how "out of office, still available" is expressed.
    // Treating it as busy would block a week for nothing.
    const busy = parseBusyIntervals(
      event(["DTSTART:20260615T090000Z", "DTEND:20260615T100000Z", "TRANSP:TRANSPARENT"]),
      WINDOW,
    );
    expect(busy).toHaveLength(0);
  });

  it("ignores a cancelled event", () => {
    const busy = parseBusyIntervals(
      event(["DTSTART:20260615T090000Z", "DTEND:20260615T100000Z", "STATUS:CANCELLED"]),
      WINDOW,
    );
    expect(busy).toHaveLength(0);
  });

  it("keeps an event that started before the window and runs into it", () => {
    // A meeting that began yesterday and ends this morning still blocks this
    // morning. Containment instead of overlap loses exactly these.
    const busy = parseBusyIntervals(
      event(["DTSTART:20260531T230000Z", "DTEND:20260601T030000Z"]),
      WINDOW,
    );
    expect(busy).toHaveLength(1);
  });

  it("drops an event entirely outside the window", () => {
    const busy = parseBusyIntervals(
      event(["DTSTART:20250101T090000Z", "DTEND:20250101T100000Z"]),
      WINDOW,
    );
    expect(busy).toHaveLength(0);
  });

  it("skips a malformed event without losing the good ones around it", () => {
    // One broken entry in a year of real calendar must not cost every other.
    const doc = wrap(
      [
        "BEGIN:VEVENT",
        "DTSTART:not-a-date",
        "DTEND:also-not",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "DTSTART:20260615T090000Z",
        "DTEND:20260615T100000Z",
        "END:VEVENT",
      ].join("\r\n"),
    );
    expect(parseBusyIntervals(doc, WINDOW)).toHaveLength(1);
  });

  it("returns nothing for an empty document instead of throwing", () => {
    expect(parseBusyIntervals("", WINDOW)).toEqual([]);
    expect(parseBusyIntervals("garbage", WINDOW)).toEqual([]);
  });
});

describe("recurrence", () => {
  it("expands a weekly meeting across the window", () => {
    const busy = parseBusyIntervals(
      event(["DTSTART:20260601T090000Z", "DTEND:20260601T100000Z", "RRULE:FREQ=WEEKLY;COUNT=5"]),
      WINDOW,
    );
    expect(busy).toHaveLength(5);
  });

  it("stops at UNTIL", () => {
    const busy = parseBusyIntervals(
      event([
        "DTSTART:20260601T090000Z",
        "DTEND:20260601T100000Z",
        "RRULE:FREQ=WEEKLY;UNTIL=20260615T000000Z",
      ]),
      WINDOW,
    );
    expect(busy).toHaveLength(2);
  });

  it("honours INTERVAL", () => {
    const busy = parseBusyIntervals(
      event([
        "DTSTART:20260601T090000Z",
        "DTEND:20260601T100000Z",
        "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3",
      ]),
      WINDOW,
    );
    expect(busy).toHaveLength(3);
    expect(busy[1].start.getTime() - busy[0].start.getTime()).toBe(14 * DAY_MS);
  });

  it("expands several weekdays from one rule", () => {
    const busy = parseBusyIntervals(
      event([
        "DTSTART:20260601T090000Z",
        "DTEND:20260601T093000Z",
        "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4",
      ]),
      WINDOW,
    );
    expect(busy).toHaveLength(4);
  });

  it("removes an excluded occurrence", () => {
    // The cancelled instance of a weekly meeting is free time, and offering it
    // is the whole point of reading the calendar.
    const busy = parseBusyIntervals(
      event([
        "DTSTART:20260601T090000Z",
        "DTEND:20260601T100000Z",
        "RRULE:FREQ=WEEKLY;COUNT=3",
        "EXDATE:20260608T090000Z",
      ]),
      WINDOW,
    );
    expect(busy).toHaveLength(2);
  });

  it("bounds an unbounded daily rule instead of running forever", () => {
    // FREQ=DAILY with no COUNT and no UNTIL is genuinely infinite.
    const busy = parseBusyIntervals(
      event(["DTSTART:20260601T090000Z", "DTEND:20260601T093000Z", "RRULE:FREQ=DAILY"]),
      WINDOW,
    );
    expect(busy.length).toBeGreaterThan(30);
    expect(busy.length).toBeLessThan(400);
  });

  it("does not loop on a frequency it does not implement", () => {
    const rule = parseRrule("FREQ=HOURLY;COUNT=5")!;
    const out = expandRecurrence(
      new Date("2026-06-01T09:00:00Z"),
      rule,
      WINDOW.windowStart,
      WINDOW.windowEnd,
    );
    expect(out.length).toBeLessThanOrEqual(1);
  });

  it("reads a rule with no FREQ as no rule at all", () => {
    expect(parseRrule("COUNT=5")).toBeNull();
  });
});

describe("merging", () => {
  it("joins overlapping intervals", () => {
    const merged = mergeIntervals([
      { start: new Date("2026-06-01T09:00:00Z"), end: new Date("2026-06-01T10:00:00Z") },
      { start: new Date("2026-06-01T09:30:00Z"), end: new Date("2026-06-01T11:00:00Z") },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].end.toISOString()).toBe("2026-06-01T11:00:00.000Z");
  });

  it("joins back-to-back intervals", () => {
    const merged = mergeIntervals([
      { start: new Date("2026-06-01T09:00:00Z"), end: new Date("2026-06-01T10:00:00Z") },
      { start: new Date("2026-06-01T10:00:00Z"), end: new Date("2026-06-01T11:00:00Z") },
    ]);
    expect(merged).toHaveLength(1);
  });

  it("keeps genuinely separate intervals apart", () => {
    const merged = mergeIntervals([
      { start: new Date("2026-06-01T09:00:00Z"), end: new Date("2026-06-01T10:00:00Z") },
      { start: new Date("2026-06-01T14:00:00Z"), end: new Date("2026-06-01T15:00:00Z") },
    ]);
    expect(merged).toHaveLength(2);
  });

  it("does not swallow an interval contained in another", () => {
    const merged = mergeIntervals([
      { start: new Date("2026-06-01T09:00:00Z"), end: new Date("2026-06-01T17:00:00Z") },
      { start: new Date("2026-06-01T10:00:00Z"), end: new Date("2026-06-01T11:00:00Z") },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].end.toISOString()).toBe("2026-06-01T17:00:00.000Z");
  });

  it("does not mutate its input", () => {
    const input = [
      { start: new Date("2026-06-01T10:00:00Z"), end: new Date("2026-06-01T11:00:00Z") },
      { start: new Date("2026-06-01T09:00:00Z"), end: new Date("2026-06-01T10:30:00Z") },
    ];
    const before = input.map((i) => i.end.toISOString());
    mergeIntervals(input);
    expect(input.map((i) => i.end.toISOString())).toEqual(before);
  });

  it("returns sorted output", () => {
    const merged = mergeIntervals([
      { start: new Date("2026-06-02T09:00:00Z"), end: new Date("2026-06-02T10:00:00Z") },
      { start: new Date("2026-06-01T09:00:00Z"), end: new Date("2026-06-01T10:00:00Z") },
    ]);
    expect(merged[0].start.getTime()).toBeLessThan(merged[1].start.getTime());
  });
});

describe("what the parser deliberately does not keep", () => {
  it("returns only times — never titles, guests or descriptions", () => {
    // A psychiatric clinic must not hold a mirror of its doctors' private lives
    // in order to avoid double-booking them.
    const busy = parseBusyIntervals(
      event([
        "DTSTART:20260615T090000Z",
        "DTEND:20260615T100000Z",
        "SUMMARY:Therapy with Dr Meier",
        "DESCRIPTION:Very private",
        "ATTENDEE:mailto:someone@example.com",
      ]),
      WINDOW,
    );
    expect(busy).toHaveLength(1);
    expect(Object.keys(busy[0]).sort()).toEqual(["end", "start"]);
  });
});
