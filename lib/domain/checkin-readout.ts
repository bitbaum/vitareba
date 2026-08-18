/**
 * WHAT TODAY'S CHECK-IN ACTUALLY SAYS — today's five numbers measured against
 * the patient's own recent baseline.
 *
 * The check-in used to end in a confirmation: five numbers went into the
 * database and nothing came back. In a product whose whole claim is that the
 * data is worth collecting, that is the wrong trade. This turns the entry into
 * a reading — pure, injectable, and tested, so the number a patient sees is
 * the number a clinician would compute by hand.
 *
 * Direction (which way is "better") is never decided here: it comes from
 * CHECKIN_METRICS, so stress stays inverted everywhere at once.
 */

import {
  CHECKIN_BASELINE_DAYS,
  CHECKIN_METRICS,
  CHECKIN_MOVE_THRESHOLD,
  type MetricKey,
} from "@/lib/config/portal";
import { orient, wellnessAvg } from "@/lib/domain/signals";

export type CheckinRow = { date: string } & Record<MetricKey, number>;

export type MetricReadout = {
  key: MetricKey;
  label: string;
  shortLabel: string;
  /** Today's raw 1–5 value. */
  value: number;
  /** Mean of the baseline window; null when there is no history to compare to. */
  baseline: number | null;
  /** Raw today − baseline (sign is the scale's, not the patient's benefit). */
  delta: number | null;
  /** Is the move in the good direction? null when flat or without a baseline. */
  better: boolean | null;
  /** Did it move far enough to be worth saying out loud? */
  material: boolean;
};

export type CheckinReadout = {
  metrics: MetricReadout[];
  /** Today's wellness score, 1–5, stress inverted. */
  wellness: number;
  wellnessBaseline: number | null;
  /** Days the baseline actually averages — 0 on a patient's first check-in. */
  baselineDays: number;
  /** One factual sentence. States what moved; never prescribes. */
  headline: string;
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

const mean = (values: number[]): number =>
  values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * @param today   The check-in just saved (or today's stored row).
 * @param history Every check-in known, any order. Rows dated on or after
 *                `today` are ignored — a baseline that includes today would
 *                flatten the very move it exists to reveal.
 * @param window  Baseline length in days; injectable for tests.
 */
export function computeCheckinReadout(
  today: CheckinRow,
  history: CheckinRow[],
  window: number = CHECKIN_BASELINE_DAYS
): CheckinReadout {
  const past = history
    .filter((c) => c.date < today.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, window);

  const metrics: MetricReadout[] = CHECKIN_METRICS.map((m) => {
    const value = today[m.key];
    if (past.length === 0) {
      return {
        key: m.key,
        label: m.label,
        shortLabel: m.shortLabel,
        value,
        baseline: null,
        delta: null,
        better: null,
        material: false,
      };
    }
    const baseline = round1(mean(past.map((c) => c[m.key])));
    const delta = round1(value - baseline);
    const gain = orient(value, m.inverted) - orient(baseline, m.inverted);
    return {
      key: m.key,
      label: m.label,
      shortLabel: m.shortLabel,
      value,
      baseline,
      delta,
      better: gain === 0 ? null : gain > 0,
      material: Math.abs(gain) >= CHECKIN_MOVE_THRESHOLD,
    };
  });

  return {
    metrics,
    wellness: round1(wellnessAvg(today)),
    wellnessBaseline: past.length === 0 ? null : round1(mean(past.map(wellnessAvg))),
    baselineDays: past.length,
    headline: headlineFor(metrics, past.length, window),
  };
}

/** "focus up 1.2" — raw direction, so it reads the same way the scale does. */
function phrase(m: MetricReadout): string {
  const delta = m.delta ?? 0;
  return `${m.shortLabel.toLowerCase()} ${delta > 0 ? "up" : "down"} ${Math.abs(delta)}`;
}

function headlineFor(metrics: MetricReadout[], baselineDays: number, window: number): string {
  if (baselineDays === 0) {
    return "Your first data point. From tomorrow, every check-in is measured against your own baseline.";
  }

  const moved = metrics.filter((m) => m.material);
  const byMagnitude = [...moved].sort(
    (a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0)
  );
  const gain = byMagnitude.find((m) => m.better === true);
  const loss = byMagnitude.find((m) => m.better === false);

  // "7-day baseline" while the window is still filling would overstate it.
  const window_ = baselineDays < window ? `${baselineDays}-day` : `${window}-day`;
  const prefix = `Vs your ${window_} baseline`;

  if (gain && loss) return `${prefix}: ${phrase(gain)} — your clearest gain; ${phrase(loss)} — the one to watch.`;
  if (gain) return `${prefix}: ${phrase(gain)} — your clearest gain today.`;
  if (loss) return `${prefix}: ${phrase(loss)} — the one to watch.`;
  return `Today tracks your ${window_} baseline — nothing has moved materially.`;
}
