/// <reference types="vitest/globals" />
/**
 * The readout is the number a patient reads about their own body, so the
 * inversion (stress) and the baseline window are pinned here: getting either
 * wrong tells someone their worst day was their best.
 */
import { describe, expect, it } from "vitest";
import { computeCheckinReadout, type CheckinRow } from "./checkin-readout";
import { CHECKIN_BASELINE_DAYS } from "@/lib/config/portal";

const day = (date: string, v: Partial<CheckinRow> = {}): CheckinRow => ({
  date,
  sleep: 3,
  energy: 3,
  mood: 3,
  focus: 3,
  stress: 3,
  ...v,
});

const pick = (r: ReturnType<typeof computeCheckinReadout>, key: string) =>
  r.metrics.find((m) => m.key === key)!;

describe("computeCheckinReadout", () => {
  it("reports no baseline on the first ever check-in", () => {
    const r = computeCheckinReadout(day("2026-05-07", { focus: 5 }), []);
    expect(r.baselineDays).toBe(0);
    expect(pick(r, "focus").baseline).toBeNull();
    expect(pick(r, "focus").delta).toBeNull();
    expect(pick(r, "focus").better).toBeNull();
    expect(r.headline).toContain("first data point");
  });

  it("averages only days BEFORE today — today never dilutes its own baseline", () => {
    const today = day("2026-05-07", { focus: 5 });
    const history = [today, day("2026-05-06", { focus: 1 }), day("2026-05-05", { focus: 1 })];
    const r = computeCheckinReadout(today, history);
    expect(r.baselineDays).toBe(2);
    expect(pick(r, "focus").baseline).toBe(1);
    expect(pick(r, "focus").delta).toBe(4);
  });

  it("limits the baseline to the configured window, newest first", () => {
    const history = Array.from({ length: CHECKIN_BASELINE_DAYS + 5 }, (_, i) =>
      // Older days score 1, the most recent `window` days score 4
      day(`2026-05-${String(20 - i).padStart(2, "0")}`, { energy: i < CHECKIN_BASELINE_DAYS ? 4 : 1 })
    );
    const r = computeCheckinReadout(day("2026-05-21", { energy: 4 }), history);
    expect(r.baselineDays).toBe(CHECKIN_BASELINE_DAYS);
    expect(pick(r, "energy").baseline).toBe(4);
  });

  it("counts LESS stress as better and MORE stress as worse", () => {
    const history = [day("2026-05-06", { stress: 4 }), day("2026-05-05", { stress: 4 })];

    const calmer = computeCheckinReadout(day("2026-05-07", { stress: 2 }), history);
    expect(pick(calmer, "stress").delta).toBe(-2);
    expect(pick(calmer, "stress").better).toBe(true);

    const tenser = computeCheckinReadout(day("2026-05-07", { stress: 5 }), history);
    expect(pick(tenser, "stress").delta).toBe(1);
    expect(pick(tenser, "stress").better).toBe(false);
  });

  it("treats an unchanged metric as neither better nor worse", () => {
    const r = computeCheckinReadout(day("2026-05-07"), [day("2026-05-06"), day("2026-05-05")]);
    expect(pick(r, "mood").delta).toBe(0);
    expect(pick(r, "mood").better).toBeNull();
    expect(pick(r, "mood").material).toBe(false);
    expect(r.headline).toContain("nothing has moved");
  });

  it("ignores moves below the materiality threshold", () => {
    // 3 vs a baseline of 3.25 — a quarter point is noise, not a finding
    const history = [
      day("2026-05-06", { focus: 4 }),
      day("2026-05-05", { focus: 3 }),
      day("2026-05-04", { focus: 3 }),
      day("2026-05-03", { focus: 3 }),
    ];
    const r = computeCheckinReadout(day("2026-05-07", { focus: 3 }), history);
    expect(pick(r, "focus").delta).toBe(-0.3);
    expect(pick(r, "focus").material).toBe(false);
  });

  it("names the clearest gain and the one to watch", () => {
    const history = [
      day("2026-05-06", { focus: 2, sleep: 5 }),
      day("2026-05-05", { focus: 2, sleep: 5 }),
    ];
    const r = computeCheckinReadout(day("2026-05-07", { focus: 5, sleep: 2 }), history);
    expect(r.headline).toContain("focus up 3");
    expect(r.headline).toContain("sleep down 3");
    expect(r.headline).toContain("the one to watch");
  });

  it("describes a partial window honestly rather than claiming a full one", () => {
    const r = computeCheckinReadout(
      day("2026-05-07", { focus: 5 }),
      [day("2026-05-06", { focus: 2 })]
    );
    expect(r.headline).toContain("1-day baseline");
    expect(r.headline).not.toContain(`${CHECKIN_BASELINE_DAYS}-day`);
  });

  it("scores wellness with stress inverted, against the same window", () => {
    // All fours with stress 2 → (4+4+4+4+4)/5 = 4
    const today = day("2026-05-07", { sleep: 4, energy: 4, mood: 4, focus: 4, stress: 2 });
    const r = computeCheckinReadout(today, [day("2026-05-06")]);
    expect(r.wellness).toBe(4);
    // Baseline day is all threes → (3+3+3+3+3)/5 = 3
    expect(r.wellnessBaseline).toBe(3);
  });
});
