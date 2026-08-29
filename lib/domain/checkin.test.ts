/// <reference types="vitest/globals" />
import { computeStreak, streakMessage, normalizeCheckinMetric, checkinSchema } from "./checkin";

// Fixed reference "today": 2025-04-10
const TODAY = new Date("2025-04-10T12:00:00");

function d(offset: number): string {
  // Returns a YYYY-MM-DD string offset days before TODAY
  const dt = new Date(TODAY);
  dt.setDate(dt.getDate() + offset);
  return dt.toISOString().slice(0, 10);
}

// ─── computeStreak ────────────────────────────────────────────────────────────

describe("computeStreak", () => {
  it("returns 0 for empty check-in list", () => {
    expect(computeStreak([], TODAY)).toBe(0);
  });

  it("returns 1 when only today is checked in", () => {
    expect(computeStreak([{ date: d(0) }], TODAY)).toBe(1);
  });

  it("returns 0 when most recent check-in was yesterday (no today entry)", () => {
    expect(computeStreak([{ date: d(-1) }], TODAY)).toBe(0);
  });

  it("returns 3 for three consecutive days ending today", () => {
    const checkins = [{ date: d(0) }, { date: d(-1) }, { date: d(-2) }];
    expect(computeStreak(checkins, TODAY)).toBe(3);
  });

  it("stops at a gap — does not count days before the gap", () => {
    // Today + 3 days ago (gap: yesterday and 2 days ago missing)
    const checkins = [{ date: d(0) }, { date: d(-3) }];
    expect(computeStreak(checkins, TODAY)).toBe(1);
  });

  it("handles unsorted input (sorts internally)", () => {
    const checkins = [{ date: d(-2) }, { date: d(0) }, { date: d(-1) }];
    expect(computeStreak(checkins, TODAY)).toBe(3);
  });

  it("returns 7 for a full week streak", () => {
    const checkins = Array.from({ length: 7 }, (_, i) => ({ date: d(-i) }));
    expect(computeStreak(checkins, TODAY)).toBe(7);
  });

  it("counts only from the most recent contiguous block", () => {
    // 3 days, gap, then 2 more — streak should be 3
    const checkins = [
      { date: d(0) },
      { date: d(-1) },
      { date: d(-2) },
      { date: d(-5) },
      { date: d(-6) },
    ];
    expect(computeStreak(checkins, TODAY)).toBe(3);
  });

  it("ignores extra fields on check-in objects", () => {
    const checkins = [
      { date: d(0), sleep: 4, energy: 3, mood: 4, focus: 5, stress: 2 },
      { date: d(-1), sleep: 3, energy: 4, mood: 3, focus: 4, stress: 3 },
    ];
    expect(computeStreak(checkins, TODAY)).toBe(2);
  });

  it("does not mutate the input array", () => {
    const checkins = [{ date: d(-2) }, { date: d(0) }, { date: d(-1) }];
    const copy = [...checkins.map((c) => ({ ...c }))];
    computeStreak(checkins, TODAY);
    expect(checkins).toEqual(copy);
  });

  it("returns 30 for a 30-day streak", () => {
    const checkins = Array.from({ length: 30 }, (_, i) => ({ date: d(-i) }));
    expect(computeStreak(checkins, TODAY)).toBe(30);
  });

  // Defensive: a stray future-dated row (e.g. legacy DB row from before the
  // schema-level guard) must NOT short-circuit the loop and wipe the streak.
  describe("future-dated records", () => {
    it("ignores a future record sitting above today's check-in", () => {
      const checkins = [{ date: d(7) }, { date: d(0) }, { date: d(-1) }];
      expect(computeStreak(checkins, TODAY)).toBe(2);
    });

    it("returns 0 when only a future record exists (no real history)", () => {
      expect(computeStreak([{ date: d(5) }], TODAY)).toBe(0);
    });

    it("counts streak normally when several future records are mixed in", () => {
      const checkins = [
        { date: d(10) },
        { date: d(3) },
        { date: d(0) },
        { date: d(-1) },
        { date: d(-2) },
      ];
      expect(computeStreak(checkins, TODAY)).toBe(3);
    });
  });
});

// ─── checkinSchema future-date guard ──────────────────────────────────────────

describe("checkinSchema (future-date guard)", () => {
  const validMetrics = { sleep: 3, energy: 3, mood: 3, focus: 3, stress: 3 };
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const farFuture = "2099-12-31";
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  it("accepts today", () => {
    expect(checkinSchema.safeParse({ date: today, ...validMetrics }).success).toBe(true);
  });

  it("accepts a past date (backfill)", () => {
    expect(checkinSchema.safeParse({ date: yesterday, ...validMetrics }).success).toBe(true);
  });

  it("rejects tomorrow", () => {
    expect(checkinSchema.safeParse({ date: tomorrow, ...validMetrics }).success).toBe(false);
  });

  it("rejects a far-future date", () => {
    expect(checkinSchema.safeParse({ date: farFuture, ...validMetrics }).success).toBe(false);
  });

  it("rejects malformed date", () => {
    expect(checkinSchema.safeParse({ date: "not-a-date", ...validMetrics }).success).toBe(false);
  });
});

// ─── normalizeCheckinMetric ───────────────────────────────────────────────────

describe("normalizeCheckinMetric", () => {
  it("normalizes scale minimum (1) to 0", () => {
    expect(normalizeCheckinMetric(1)).toBe(0);
  });

  it("normalizes scale maximum (5) to 100", () => {
    expect(normalizeCheckinMetric(5)).toBe(100);
  });

  it("normalizes midpoint (3) to 50", () => {
    expect(normalizeCheckinMetric(3)).toBe(50);
  });

  it("normalizes 2 to 25", () => {
    expect(normalizeCheckinMetric(2)).toBe(25);
  });

  it("normalizes 4 to 75", () => {
    expect(normalizeCheckinMetric(4)).toBe(75);
  });

  it("returns an integer (Math.round applied)", () => {
    // 1.5 on a 1–5 scale → (0.5 / 4) * 100 = 12.5 → rounds to 13
    expect(normalizeCheckinMetric(1.5)).toBe(13);
  });
});

// ─── streakMessage ────────────────────────────────────────────────────────────

describe("streakMessage", () => {
  it("returns day-1 affirmation for streak of 1", () => {
    expect(streakMessage(1)).toContain("Day 1 done");
  });

  it("returns fallback message for streak of 0", () => {
    expect(streakMessage(0)).toContain("First data point");
  });

  it("returns 2-day message for streak of 2", () => {
    expect(streakMessage(2)).toContain("2 days running");
  });

  it("returns pattern message for streaks 3–6", () => {
    expect(streakMessage(3)).toContain("3 days in a row");
    expect(streakMessage(6)).toContain("6 days in a row");
  });

  it("returns week message for streaks 7–13", () => {
    expect(streakMessage(7)).toContain("full week");
    expect(streakMessage(13)).toContain("13-day streak");
  });

  it("returns two-week message for streaks 14–29", () => {
    expect(streakMessage(14)).toContain("two weeks");
    expect(streakMessage(29)).toContain("29-day streak");
  });

  it("returns elite message for streaks 30–99", () => {
    expect(streakMessage(30)).toContain("elite");
    expect(streakMessage(99)).toContain("elite");
  });

  it("returns dataset message for streaks ≥ 100, including the correct count", () => {
    expect(streakMessage(100)).toContain("dataset");
    expect(streakMessage(100)).toContain("100");
    expect(streakMessage(150)).toContain("dataset");
    expect(streakMessage(150)).toContain("150");
  });

  it("30–99 day messages include the actual streak count", () => {
    expect(streakMessage(65)).toContain("65");
    expect(streakMessage(65)).toContain("elite");
    expect(streakMessage(65)).not.toContain("30-day");
  });
});
