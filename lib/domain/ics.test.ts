/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import { buildIcsFeed, buildIcsInvite, escapeIcsText, foldIcsLine, toIcsUtc } from "./ics";

const START = new Date("2026-08-20T07:30:00.000Z"); // 09:30 Zürich
const END = new Date("2026-08-20T08:20:00.000Z");

const base = {
  uid: "booking-abc@vitareba",
  start: START,
  end: END,
  summary: "Consultation with Dr Manuel Schabus",
  now: new Date("2026-08-14T00:00:00.000Z"),
};

describe("toIcsUtc", () => {
  it("emits the RFC 5545 UTC form", () => {
    expect(toIcsUtc(START)).toBe("20260820T073000Z");
  });
});

describe("escapeIcsText", () => {
  it("escapes the four special characters", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });
});

describe("foldIcsLine", () => {
  it("leaves short lines alone", () => {
    expect(foldIcsLine("SUMMARY:short")).toBe("SUMMARY:short");
  });

  it("folds long lines with a leading space on continuations", () => {
    const folded = foldIcsLine(`SUMMARY:${"x".repeat(200)}`);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0].length).toBe(75);
    for (const cont of lines.slice(1)) expect(cont.startsWith(" ")).toBe(true);
  });

  it("never splits a multi-byte character", () => {
    // Umlauts are 2 bytes each: a naive length-based fold lands mid-sequence.
    const line = `LOCATION:${"ü".repeat(80)}`;
    const rejoined = foldIcsLine(line).split("\r\n ").join("");
    expect(rejoined).toBe(line);
    expect(rejoined).not.toContain("�");
  });
});

describe("buildIcsInvite", () => {
  const ics = buildIcsInvite({
    ...base,
    location: "Zürich",
    organizer: { name: "Dr Manuel Schabus", email: "manuel@example.com" },
    attendees: [{ name: "Pat", email: "pat@example.com" }],
    sequence: 1,
  });

  it("is a complete calendar object", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
  });

  it("uses METHOD:REQUEST so mail clients offer 'add to calendar'", () => {
    expect(ics).toContain("METHOD:REQUEST");
  });

  it("carries the times, uid, sequence and contacts", () => {
    expect(ics).toContain("UID:booking-abc@vitareba");
    expect(ics).toContain("DTSTART:20260820T073000Z");
    expect(ics).toContain("DTEND:20260820T082000Z");
    expect(ics).toContain("SEQUENCE:1");
    expect(ics).toContain("ORGANIZER;CN=Dr Manuel Schabus:mailto:manuel@example.com");
    expect(ics).toContain("ATTENDEE;CN=Pat:mailto:pat@example.com");
  });

  it("publishes cancellations as CANCEL/CANCELLED so the entry disappears", () => {
    const cancelled = buildIcsInvite({ ...base, cancelled: true, sequence: 3 });
    expect(cancelled).toContain("METHOD:CANCEL");
    expect(cancelled).toContain("STATUS:CANCELLED");
  });

  it("uses CRLF line endings everywhere (clients reject bare LF)", () => {
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });
});

describe("buildIcsFeed", () => {
  const feed = buildIcsFeed(
    [base, { ...base, uid: "booking-def@vitareba" }],
    "VitaReBa — Dr Manuel Schabus",
  );

  it("holds every event", () => {
    expect(feed.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it("names the calendar and asks clients to re-poll", () => {
    expect(feed).toContain("X-WR-CALNAME:VitaReBa — Dr Manuel Schabus");
    expect(feed).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT15M");
  });

  it("carries no METHOD — a subscription is not an invitation", () => {
    expect(feed).not.toContain("METHOD:");
  });
});
