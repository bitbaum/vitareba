/// <reference types="vitest/globals" />
import { computePatientSignal, wellnessAvg, sparkLevel } from "./signals";
import {
  NEW_PATIENT_GRACE_DAYS,
  NO_CHECKIN_CRITICAL_DAYS,
  SCORE_DROP_CRITICAL,
} from "@/lib/config/admin";
import { formatDateISO } from "@/lib/utils/format";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date("2024-06-15T12:00:00Z");
  d.setDate(d.getDate() - n);
  return d;
}

const NOW = new Date("2024-06-15T12:00:00Z");

function dateStr(daysBack: number): string {
  const d = new Date("2024-06-15");
  d.setDate(d.getDate() - daysBack);
  return formatDateISO(d);
}

function checkin(daysBack: number, score: number) {
  // score 1–5; all dims equal for simplicity
  return {
    date: dateStr(daysBack),
    sleep: score,
    energy: score,
    mood: score,
    focus: score,
    stress: 6 - score, // inverted: high score = low stress
  };
}

const GOOD_ASSESSMENT = { overallScore: 75, completedAt: daysAgo(5) };
const DECENT_ASSESSMENT = { overallScore: 60, completedAt: daysAgo(30) };
const LOW_ASSESSMENT = { overallScore: 60 - SCORE_DROP_CRITICAL - 1, completedAt: daysAgo(1) };

// ─── Tests ────────────────────────────────────────────────────────────────────

const D = "2024-01-01"; // date field required by CheckinRow, irrelevant to wellnessAvg

describe("wellnessAvg", () => {
  it("returns 5 when all dims are at max (stress=1 → least stressed)", () => {
    expect(wellnessAvg({ date: D, sleep: 5, energy: 5, mood: 5, focus: 5, stress: 1 })).toBe(5);
  });

  it("returns 1 when all dims are at min (stress=5 → most stressed)", () => {
    expect(wellnessAvg({ date: D, sleep: 1, energy: 1, mood: 1, focus: 1, stress: 5 })).toBe(1);
  });

  it("returns 3 when all dims including inverted stress are equal (stress=3)", () => {
    expect(wellnessAvg({ date: D, sleep: 3, energy: 3, mood: 3, focus: 3, stress: 3 })).toBe(3);
  });

  it("stress is inverted: high stress (5) drags the score down", () => {
    // sleep=5, energy=5, mood=5, focus=5, stress=5 → (5+5+5+5+(6-5))/5 = 21/5 = 4.2
    expect(wellnessAvg({ date: D, sleep: 5, energy: 5, mood: 5, focus: 5, stress: 5 })).toBeCloseTo(
      4.2,
    );
  });

  it("computes a mixed-value average correctly", () => {
    // (4+3+2+5+(6-2))/5 = 18/5 = 3.6
    expect(wellnessAvg({ date: D, sleep: 4, energy: 3, mood: 2, focus: 5, stress: 2 })).toBeCloseTo(
      3.6,
    );
  });
});

describe("computePatientSignal", () => {
  it("returns 'new' when patient registered within grace period", () => {
    const result = computePatientSignal({
      registeredAt: daysAgo(NEW_PATIENT_GRACE_DAYS - 1),
      checkins: [],
      assessments: [],
      bookings: [],
      now: NOW,
    });
    expect(result.signal).toBe("new");
    expect(result.urgency).toBe(0);
  });

  it("returns 'critical' when no check-in for >= threshold days", () => {
    const result = computePatientSignal({
      registeredAt: daysAgo(30),
      checkins: [checkin(NO_CHECKIN_CRITICAL_DAYS, 3)], // last checkin exactly at threshold
      assessments: [GOOD_ASSESSMENT],
      bookings: [{ id: "b1", status: "confirmed" as const, createdAt: daysAgo(5) }],
      now: NOW,
    });
    expect(result.signal).toBe("critical");
    expect(result.reason).toMatch(/No check-in/);
    expect(result.urgency).toBe(NO_CHECKIN_CRITICAL_DAYS); // urgency = days since last check-in
  });

  it("returns 'critical' when wellness declines 3 consecutive days", () => {
    const result = computePatientSignal({
      registeredAt: daysAgo(30),
      checkins: [
        checkin(0, 2), // most recent — worst
        checkin(1, 3),
        checkin(2, 4), // oldest of the 3 — best
      ],
      assessments: [GOOD_ASSESSMENT],
      bookings: [{ id: "b1", status: "confirmed" as const, createdAt: daysAgo(5) }],
      now: NOW,
    });
    expect(result.signal).toBe("critical");
    expect(result.reason).toMatch(/declining/);
    expect(result.urgency).toBe(50);
  });

  it("does not flag critical when wellness is flat (not strictly declining)", () => {
    const result = computePatientSignal({
      registeredAt: daysAgo(30),
      checkins: [
        checkin(0, 3),
        checkin(1, 3), // same score — breaks strictly declining chain
        checkin(2, 4),
      ],
      assessments: [GOOD_ASSESSMENT],
      bookings: [{ id: "b1", status: "confirmed" as const, createdAt: daysAgo(5) }],
      now: NOW,
    });
    expect(result.signal).not.toBe("critical");
  });

  it("does not flag critical when declining check-ins are not on consecutive days", () => {
    // Days 0, 3, 6 — declining but not consecutive calendar days
    const result = computePatientSignal({
      registeredAt: daysAgo(30),
      checkins: [
        checkin(0, 2), // most recent — worst
        checkin(3, 3), // 3-day gap
        checkin(6, 4), // oldest of the 3 — best
      ],
      assessments: [GOOD_ASSESSMENT],
      bookings: [{ id: "b1", status: "confirmed" as const, createdAt: daysAgo(5) }],
      now: NOW,
    });
    expect(result.signal).not.toBe("critical");
  });

  it("returns 'critical' when assessment score drops by more than threshold", () => {
    const drop = Math.abs(LOW_ASSESSMENT.overallScore - GOOD_ASSESSMENT.overallScore);
    const result = computePatientSignal({
      registeredAt: daysAgo(30),
      checkins: [checkin(0, 3)],
      assessments: [
        LOW_ASSESSMENT, // latest — dropped
        GOOD_ASSESSMENT, // previous — was high
      ],
      bookings: [{ id: "b1", status: "confirmed" as const, createdAt: daysAgo(5) }],
      now: NOW,
    });
    expect(result.signal).toBe("critical");
    expect(result.reason).toMatch(/Assessment score dropped/);
    expect(result.urgency).toBe(drop); // urgency = magnitude of score drop
  });

  it("returns 'attention' when no assessment taken (past grace period)", () => {
    const result = computePatientSignal({
      registeredAt: daysAgo(30),
      checkins: [checkin(0, 3)],
      assessments: [],
      bookings: [],
      now: NOW,
    });
    expect(result.signal).toBe("attention");
    expect(result.reason).toMatch(/No assessment/);
    expect(result.urgency).toBe(30); // urgency = days since registration
  });

  it("returns 'attention' when assessment done but no booking", () => {
    const result = computePatientSignal({
      registeredAt: daysAgo(30),
      checkins: [checkin(0, 3)],
      assessments: [GOOD_ASSESSMENT],
      bookings: [],
      now: NOW,
    });
    expect(result.signal).toBe("attention");
    expect(result.reason).toMatch(/no booking/);
    expect(result.urgency).toBe(10);
  });

  it("returns 'active' when all conditions normal", () => {
    const result = computePatientSignal({
      registeredAt: daysAgo(30),
      checkins: [checkin(0, 3), checkin(1, 3), checkin(2, 3)],
      assessments: [GOOD_ASSESSMENT, DECENT_ASSESSMENT],
      bookings: [{ id: "b1", status: "confirmed" as const, createdAt: daysAgo(5) }],
      now: NOW,
    });
    expect(result.signal).toBe("active");
    expect(result.urgency).toBe(0);
  });

  it("returns 'active' when booking is attended (attended counts as active)", () => {
    const result = computePatientSignal({
      registeredAt: daysAgo(30),
      checkins: [checkin(0, 3)],
      assessments: [GOOD_ASSESSMENT],
      bookings: [{ id: "b1", status: "attended" as const, createdAt: daysAgo(5) }],
      now: NOW,
    });
    expect(result.signal).toBe("active");
  });

  it("returns 'attention' when only booking is cancelled (cancelled does not count)", () => {
    const result = computePatientSignal({
      registeredAt: daysAgo(30),
      checkins: [checkin(0, 3)],
      assessments: [GOOD_ASSESSMENT],
      bookings: [{ id: "b1", status: "cancelled" as const, createdAt: daysAgo(5) }],
      now: NOW,
    });
    expect(result.signal).toBe("attention");
    expect(result.reason).toMatch(/no booking/);
    expect(result.urgency).toBe(10);
  });

  it("returns 'attention' when only booking is pending (pending does not count)", () => {
    const result = computePatientSignal({
      registeredAt: daysAgo(30),
      checkins: [checkin(0, 3)],
      assessments: [GOOD_ASSESSMENT],
      bookings: [{ id: "b1", status: "pending" as const, createdAt: daysAgo(5) }],
      now: NOW,
    });
    expect(result.signal).toBe("attention");
    expect(result.reason).toMatch(/no booking/);
    expect(result.urgency).toBe(10);
  });

  it("does not flag critical when last check-in was exactly NO_CHECKIN_CRITICAL_DAYS - 1 days ago (boundary)", () => {
    const result = computePatientSignal({
      registeredAt: daysAgo(30),
      checkins: [checkin(NO_CHECKIN_CRITICAL_DAYS - 1, 3)],
      assessments: [GOOD_ASSESSMENT],
      bookings: [{ id: "b1", status: "confirmed" as const, createdAt: daysAgo(5) }],
      now: NOW,
    });
    expect(result.signal).not.toBe("critical");
  });

  it("does not flag critical for assessment drop exactly equal to threshold (must exceed, not equal)", () => {
    const exactlyAtThreshold = {
      overallScore: GOOD_ASSESSMENT.overallScore - SCORE_DROP_CRITICAL,
      completedAt: daysAgo(1),
    };
    const result = computePatientSignal({
      registeredAt: daysAgo(30),
      checkins: [checkin(0, 3)],
      assessments: [exactlyAtThreshold, GOOD_ASSESSMENT],
      bookings: [{ id: "b1", status: "confirmed" as const, createdAt: daysAgo(5) }],
      now: NOW,
    });
    expect(result.signal).not.toBe("critical");
  });

  it("returns 'active' for patient with no check-ins who has assessment and confirmed booking", () => {
    // Patients who haven't started check-ins yet but have completed onboarding
    // are not flagged critical — they're expected to start their tracking routine
    const result = computePatientSignal({
      registeredAt: daysAgo(30),
      checkins: [],
      assessments: [GOOD_ASSESSMENT],
      bookings: [{ id: "b1", status: "confirmed" as const, createdAt: daysAgo(5) }],
      now: NOW,
    });
    expect(result.signal).toBe("active");
    expect(result.urgency).toBe(0);
  });

  it("does not flag critical for fewer than 3 consecutive declining days (2 is not enough)", () => {
    const result = computePatientSignal({
      registeredAt: daysAgo(30),
      checkins: [
        checkin(0, 2), // most recent — lower
        checkin(1, 4), // previous — higher
        // only 2 data points, not 3
      ],
      assessments: [GOOD_ASSESSMENT],
      bookings: [{ id: "b1", status: "confirmed" as const, createdAt: daysAgo(5) }],
      now: NOW,
    });
    expect(result.signal).not.toBe("critical");
  });

  it("returns 'attention' when attended booking is older than ATTENDED_FOLLOW_UP_DAYS with no confirmed follow-up", () => {
    const result = computePatientSignal({
      registeredAt: daysAgo(90),
      checkins: [checkin(0, 3)],
      assessments: [GOOD_ASSESSMENT],
      bookings: [{ id: "b1", status: "attended" as const, createdAt: daysAgo(31) }],
      now: NOW,
    });
    expect(result.signal).toBe("attention");
    expect(result.reason).toMatch(/follow-up booking needed/);
    expect(result.urgency).toBe(31); // urgency = days since attended booking
  });

  it("returns 'active' when attended booking is within ATTENDED_FOLLOW_UP_DAYS (boundary — exactly 30 days does not trigger)", () => {
    const result = computePatientSignal({
      registeredAt: daysAgo(90),
      checkins: [checkin(0, 3)],
      assessments: [GOOD_ASSESSMENT],
      bookings: [{ id: "b1", status: "attended" as const, createdAt: daysAgo(30) }],
      now: NOW,
    });
    expect(result.signal).toBe("active");
  });

  it("returns 'active' when attended booking is old but a confirmed follow-up exists", () => {
    const result = computePatientSignal({
      registeredAt: daysAgo(90),
      checkins: [checkin(0, 3)],
      assessments: [GOOD_ASSESSMENT],
      bookings: [
        { id: "b2", status: "confirmed" as const, createdAt: daysAgo(2) },
        { id: "b1", status: "attended" as const, createdAt: daysAgo(40) },
      ],
      now: NOW,
    });
    expect(result.signal).toBe("active");
  });

  it("uses most recent attended booking when multiple exist (follow-up check)", () => {
    // Old attended booking — would trigger; recent attended booking — should not
    const result = computePatientSignal({
      registeredAt: daysAgo(90),
      checkins: [checkin(0, 3)],
      assessments: [GOOD_ASSESSMENT],
      bookings: [
        { id: "b2", status: "attended" as const, createdAt: daysAgo(5) }, // recent
        { id: "b1", status: "attended" as const, createdAt: daysAgo(60) }, // old
      ],
      now: NOW,
    });
    expect(result.signal).toBe("active");
  });
});

// ─── sparkLevel ───────────────────────────────────────────────────────────────

describe("sparkLevel", () => {
  it("returns 'low' for averages below SPARKLINE_LOW_THRESHOLD (2.5)", () => {
    expect(sparkLevel(1)).toBe("low");
    expect(sparkLevel(2.4)).toBe("low");
  });

  it("returns 'mid' for averages at or above low threshold but below mid threshold", () => {
    expect(sparkLevel(2.5)).toBe("mid");
    expect(sparkLevel(3)).toBe("mid");
    expect(sparkLevel(3.4)).toBe("mid");
  });

  it("returns 'high' for averages at or above SPARKLINE_MID_THRESHOLD (3.5)", () => {
    expect(sparkLevel(3.5)).toBe("high");
    expect(sparkLevel(4)).toBe("high");
    expect(sparkLevel(5)).toBe("high");
  });
});
