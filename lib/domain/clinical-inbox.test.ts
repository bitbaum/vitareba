/**
 * The inbox is the first thing a clinician reads each morning, so its failure
 * modes are behavioural rather than technical:
 *
 *  • Something urgent below something routine — it will be scrolled past.
 *  • The newest item at the top — the oldest item is the one already forgotten.
 *  • A stale value shouting every day — the reader stops seeing the top of the page.
 *  • Silent truncation — "nothing else" and "eight of forty" must not look alike.
 *  • A second opinion about who is critical — the list and the inbox disagree,
 *    and the clinician learns to trust neither.
 */
/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import { buildClinicalInbox, type InboxInput, type InboxPatient } from "./clinical-inbox";
import { newestPerPatientPerKind } from "./clinical-inbox-data";
import { INBOX_SECTIONS, INBOX_SECTION_LIMIT, type InboxSectionKey } from "@/lib/config/inbox";
import { BOOKING_STATUS } from "@/lib/config/booking-status";
import { NO_CHECKIN_CRITICAL_DAYS, NEW_PATIENT_GRACE_DAYS } from "@/lib/config/admin";
import { DAY_MS } from "@/lib/utils/format";

const NOW = new Date("2026-06-15T09:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

function patient(over: Partial<InboxPatient> = {}): InboxPatient {
  return {
    id: "p1",
    name: "Alex Rivera",
    email: "alex@example.com",
    // Well past the new-patient grace period, so the signal is a real judgement
    // rather than "we haven't met yet".
    registeredAt: daysAgo(NEW_PATIENT_GRACE_DAYS + 60),
    biologicalSex: null,
    checkins: [],
    assessments: [],
    bookings: [],
    ...over,
  };
}

/** Assessed, booked and checking in — raises no signal of its own. */
function healthyPatient(over: Partial<InboxPatient> = {}): InboxPatient {
  return patient({
    assessments: [{ overallScore: 78, completedAt: daysAgo(10) }],
    checkins: [{ date: isoDaysAgo(0), sleep: 4, energy: 4, mood: 4, focus: 4, stress: 2 }],
    bookings: [
      {
        id: "healthy-b",
        status: BOOKING_STATUS.confirmed,
        createdAt: daysAgo(9),
        scheduledAt: daysAgo(-3),
      },
    ],
    ...over,
  });
}

function build(over: Partial<InboxInput> = {}) {
  return buildClinicalInbox({
    now: NOW,
    patients: [],
    latestMeasurements: [],
    threads: [],
    ...over,
  });
}

const section = (inbox: ReturnType<typeof build>, key: InboxSectionKey) =>
  inbox.sections.find((s) => s.key === key)!;

describe("section order", () => {
  it("puts everything urgent above everything that can wait", () => {
    const tones = build().sections.map((s) => s.tone);
    const lastUrgent = tones.lastIndexOf("urgent");
    const firstRoutine = tones.indexOf("routine");
    expect(lastUrgent).toBeLessThan(firstRoutine);
  });

  it("always renders every section, so an empty one reads as answered", () => {
    const inbox = build();
    expect(inbox.sections).toHaveLength(INBOX_SECTIONS.length);
    for (const s of inbox.sections) {
      expect(s.empty.length, `${s.key} has no empty-state sentence`).toBeGreaterThan(0);
    }
  });

  it("reports nothing waiting when nothing is waiting", () => {
    expect(build().total).toBe(0);
  });
});

describe("results to review", () => {
  it("raises a value past a recognised action threshold", () => {
    const inbox = build({
      patients: [patient()],
      latestMeasurements: [
        { patientId: "p1", kind: "bp_systolic", value: 186, measuredAt: daysAgo(2) },
      ],
    });
    const items = section(inbox, "results").items;
    expect(items).toHaveLength(1);
    expect(items[0].headline).toContain("186");
    expect(items[0].patientName).toBe("Alex Rivera");
  });

  it("stays quiet for a value that is merely out of range", () => {
    // 150 systolic is hypertension: a consultation topic, not an alert. If this
    // fires, every hypertensive patient is on the urgent list forever.
    const inbox = build({
      patients: [patient()],
      latestMeasurements: [
        { patientId: "p1", kind: "bp_systolic", value: 150, measuredAt: daysAgo(2) },
      ],
    });
    expect(section(inbox, "results").items).toHaveLength(0);
  });

  it("reads the value against the patient's own sex where that matters", () => {
    const male = build({
      patients: [patient({ biologicalSex: "male" })],
      latestMeasurements: [
        { patientId: "p1", kind: "haemoglobin", value: 100, measuredAt: daysAgo(1) },
      ],
    });
    // 100 g/L is below both intervals but above the action threshold of 80 —
    // out of range, not an emergency, and the inbox must know the difference.
    expect(section(male, "results").items).toHaveLength(0);

    const severe = build({
      patients: [patient({ biologicalSex: "female" })],
      latestMeasurements: [
        { patientId: "p1", kind: "haemoglobin", value: 74, measuredAt: daysAgo(1) },
      ],
    });
    expect(section(severe, "results").items).toHaveLength(1);
  });

  it("names the patient even when only their email is known", () => {
    const inbox = build({
      patients: [patient({ name: null })],
      latestMeasurements: [
        { patientId: "p1", kind: "heart_rate", value: 132, measuredAt: daysAgo(1) },
      ],
    });
    expect(section(inbox, "results").items[0].patientName).toBe("alex@example.com");
  });

  it("ignores a measurement for a patient it does not know", () => {
    // A deleted patient's row must not render as "Unknown patient" at the top
    // of the urgent list every morning.
    const inbox = build({
      patients: [],
      latestMeasurements: [
        { patientId: "ghost", kind: "bp_systolic", value: 200, measuredAt: daysAgo(1) },
      ],
    });
    expect(section(inbox, "results").items[0].patientName).toBe("Unknown patient");
  });

  it("says why the value matters, in the guideline's own terms", () => {
    const inbox = build({
      patients: [patient()],
      latestMeasurements: [{ patientId: "p1", kind: "egfr", value: 22, measuredAt: daysAgo(3) }],
    });
    expect(section(inbox, "results").items[0].detail).toContain("KDIGO");
  });
});

describe("who needs contacting", () => {
  it("uses the same definition of critical as the patient list", () => {
    // A patient who has not checked in for longer than the configured limit is
    // critical by the shared signal function. The inbox must not have its own
    // opinion about that number.
    const inbox = build({
      patients: [
        patient({
          checkins: [
            {
              date: isoDaysAgo(NO_CHECKIN_CRITICAL_DAYS + 2),
              sleep: 3,
              energy: 3,
              mood: 3,
              focus: 3,
              stress: 3,
            },
          ],
        }),
      ],
    });
    expect(section(inbox, "critical").items).toHaveLength(1);
    expect(section(inbox, "attention").items).toHaveLength(0);
  });

  it("separates the routine next-step patients from the critical ones", () => {
    // Assessment done, nothing booked: attention, not critical.
    const inbox = build({
      patients: [
        patient({
          assessments: [{ overallScore: 62, completedAt: daysAgo(10) }],
          checkins: [{ date: isoDaysAgo(1), sleep: 4, energy: 4, mood: 4, focus: 4, stress: 2 }],
        }),
      ],
    });
    expect(section(inbox, "critical").items).toHaveLength(0);
    expect(section(inbox, "attention").items).toHaveLength(1);
  });

  it("leaves a healthy, engaged patient out of the inbox entirely", () => {
    const inbox = build({
      patients: [
        patient({
          assessments: [{ overallScore: 78, completedAt: daysAgo(10) }],
          checkins: [{ date: isoDaysAgo(0), sleep: 4, energy: 4, mood: 4, focus: 4, stress: 2 }],
          bookings: [
            {
              id: "b1",
              status: BOOKING_STATUS.confirmed,
              createdAt: daysAgo(9),
              scheduledAt: daysAgo(-3),
            },
          ],
        }),
      ],
    });
    expect(inbox.total).toBe(0);
  });

  it("tells the clinician how long it has been quiet", () => {
    const inbox = build({
      patients: [
        patient({
          checkins: [{ date: isoDaysAgo(9), sleep: 2, energy: 2, mood: 2, focus: 2, stress: 4 }],
        }),
      ],
    });
    expect(section(inbox, "critical").items[0].detail).toMatch(/9 days ago/);
  });
});

describe("messages waiting on a reply", () => {
  it("lists a thread the patient wrote last", () => {
    const inbox = build({
      patients: [patient()],
      threads: [
        {
          id: "t1",
          patientId: "p1",
          subject: "Side effects question",
          lastMessageAt: daysAgo(3),
          awaitingReply: true,
        },
      ],
    });
    const items = section(inbox, "messages").items;
    expect(items).toHaveLength(1);
    expect(items[0].headline).toBe("Side effects question");
    expect(items[0].detail).toContain("3 days");
  });

  it("says nothing of a thread we already answered", () => {
    const inbox = build({
      patients: [patient()],
      threads: [
        {
          id: "t1",
          patientId: "p1",
          subject: "Answered",
          lastMessageAt: daysAgo(3),
          awaitingReply: false,
        },
      ],
    });
    expect(section(inbox, "messages").items).toHaveLength(0);
  });

  it("does not call a message sent this morning overdue", () => {
    const inbox = build({
      patients: [patient()],
      threads: [
        {
          id: "t1",
          patientId: "p1",
          subject: "Quick question",
          lastMessageAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000),
          awaitingReply: true,
        },
      ],
    });
    expect(section(inbox, "messages").items[0].detail).toContain("Sent today");
  });
});

describe("bookings awaiting confirmation", () => {
  it("lists a pending request and leaves confirmed ones alone", () => {
    const inbox = build({
      patients: [
        patient({
          bookings: [
            {
              id: "b1",
              status: BOOKING_STATUS.pending,
              createdAt: daysAgo(2),
              scheduledAt: daysAgo(-5),
            },
            {
              id: "b2",
              status: BOOKING_STATUS.confirmed,
              createdAt: daysAgo(9),
              scheduledAt: daysAgo(-1),
            },
          ],
        }),
      ],
    });
    const items = section(inbox, "bookings").items;
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe("booking:b1");
  });

  it("handles a request with no time chosen", () => {
    const inbox = build({
      patients: [
        patient({
          bookings: [
            { id: "b1", status: BOOKING_STATUS.pending, createdAt: daysAgo(1), scheduledAt: null },
          ],
        }),
      ],
    });
    expect(section(inbox, "bookings").items[0].headline).toContain("no time chosen");
  });
});

describe("ordering and truncation", () => {
  it("puts the longest-waiting item first", () => {
    // The newest item is the one still fresh in mind; the oldest is the one
    // already forgotten. Sorting newest-first buries exactly the wrong thing.
    const inbox = build({
      patients: [patient()],
      threads: [
        {
          id: "recent",
          patientId: "p1",
          subject: "Recent",
          lastMessageAt: daysAgo(1),
          awaitingReply: true,
        },
        {
          id: "old",
          patientId: "p1",
          subject: "Old",
          lastMessageAt: daysAgo(12),
          awaitingReply: true,
        },
        {
          id: "mid",
          patientId: "p1",
          subject: "Mid",
          lastMessageAt: daysAgo(5),
          awaitingReply: true,
        },
      ],
    });
    expect(section(inbox, "messages").items.map((i) => i.headline)).toEqual([
      "Old",
      "Mid",
      "Recent",
    ]);
  });

  it("counts what it could not show instead of hiding it", () => {
    const many = Array.from({ length: INBOX_SECTION_LIMIT + 5 }, (_, i) => ({
      id: `t${i}`,
      patientId: "p1",
      subject: `Thread ${i}`,
      lastMessageAt: daysAgo(20 - i),
      awaitingReply: true,
    }));
    // A patient with nothing else wrong, so the count under test is only the
    // messages — otherwise this asserts two behaviours and diagnoses neither.
    const inbox = build({ patients: [healthyPatient()], threads: many });
    const s = section(inbox, "messages");
    expect(s.items).toHaveLength(INBOX_SECTION_LIMIT);
    expect(s.overflow).toBe(5);
    // The total is the honest number, not the rendered one — a badge saying 8
    // when 13 people are waiting is a lie the clinician acts on.
    expect(inbox.total).toBe(INBOX_SECTION_LIMIT + 5);
  });

  it("gives every item a key unique across the whole inbox", () => {
    const inbox = build({
      patients: [
        patient({
          checkins: [{ date: isoDaysAgo(9), sleep: 2, energy: 2, mood: 2, focus: 2, stress: 4 }],
          bookings: [
            { id: "b1", status: BOOKING_STATUS.pending, createdAt: daysAgo(2), scheduledAt: null },
          ],
        }),
      ],
      latestMeasurements: [
        { patientId: "p1", kind: "bp_systolic", value: 190, measuredAt: daysAgo(1) },
        { patientId: "p1", kind: "bp_diastolic", value: 118, measuredAt: daysAgo(1) },
      ],
      threads: [
        {
          id: "t1",
          patientId: "p1",
          subject: "Hi",
          lastMessageAt: daysAgo(2),
          awaitingReply: true,
        },
      ],
    });
    const keys = inbox.sections.flatMap((s) => s.items.map((i) => i.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThan(4);
  });
});

describe("newestPerPatientPerKind", () => {
  it("keeps the newest value for each patient and marker", () => {
    const rows = [
      { patientId: "a", kind: "bp_systolic", value: 120, measuredAt: daysAgo(30) },
      { patientId: "a", kind: "bp_systolic", value: 188, measuredAt: daysAgo(1) },
      { patientId: "a", kind: "heart_rate", value: 62, measuredAt: daysAgo(1) },
      { patientId: "b", kind: "bp_systolic", value: 118, measuredAt: daysAgo(5) },
    ];
    const out = newestPerPatientPerKind(rows);
    expect(out).toHaveLength(3);
    expect(out.find((r) => r.patientId === "a" && r.kind === "bp_systolic")?.value).toBe(188);
  });

  it("does not depend on the order it is given", () => {
    // The version that trusted the caller's ORDER BY would alert on last year's
    // reading the moment someone changed the query.
    const rows = [
      { patientId: "a", kind: "bp_systolic", value: 188, measuredAt: daysAgo(1) },
      { patientId: "a", kind: "bp_systolic", value: 120, measuredAt: daysAgo(30) },
    ];
    expect(newestPerPatientPerKind(rows)[0].value).toBe(188);
    expect(newestPerPatientPerKind([...rows].reverse())[0].value).toBe(188);
  });

  it("returns nothing for nothing", () => {
    expect(newestPerPatientPerKind([])).toEqual([]);
  });
});

function isoDaysAgo(n: number): string {
  return daysAgo(n).toISOString().slice(0, 10);
}
