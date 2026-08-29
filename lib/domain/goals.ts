import { z } from "zod";
import {
  GOAL_TITLE_MAX_LENGTH,
  GOAL_NOTES_MAX_LENGTH,
  GOAL_PROGRESS_COMPLETE_PCT,
  GOAL_PROGRESS_HIGH_PCT,
  GOAL_PROGRESS_LOW_PCT,
} from "@/lib/config/portal";

/**
 * Compute goal progress as a 0–100 integer percentage of the target range achieved.
 *
 * Formula: ((current - baseline) / (target - baseline)) * 100
 * Clamped to [0, 100] and rounded to the nearest integer.
 *
 * Returns null when the range is zero (baseline === target) or any required
 * value is missing — the UI should fall back to showing raw numbers.
 *
 * IMPORTANT: Do NOT use current/target — that ignores the baseline offset.
 */
export function computeGoalProgress(
  baseline: number | null | undefined,
  current: number | null | undefined,
  target: number | null | undefined,
): number | null {
  if (current == null || target == null) return null;
  const base = baseline ?? 0;
  const range = target - base;
  if (range === 0) return null;
  return Math.min(100, Math.max(0, Math.round(((current - base) / range) * 100)));
}

/**
 * Compute the geometry of an admin progress bar that visualises raw
 * baseline / current / target values on an absolute 0–max scale (not %-of-goal).
 *
 * Returns the fill's `left` and `width` as percentages plus the target-marker
 * position. Handles both ascending (target > baseline) and descending
 * (target < baseline, e.g. "reduce stress") goals — without this, descending
 * goals would render with zero fill width because (current − baseline) is
 * negative when current < baseline.
 *
 * Returns null when there is nothing to draw (no current AND no target).
 */
export function goalBarGeometry(
  baseline: number | null,
  current: number | null,
  target: number | null,
): { fillLeft: number; fillWidth: number; targetPct: number | null } | null {
  if (current == null && target == null) return null;
  const max = Math.max(target ?? 0, current ?? 0, baseline ?? 0, 100);
  const baselinePct = baseline != null ? (baseline / max) * 100 : 0;
  const currentPct = current != null ? (current / max) * 100 : null;
  const targetPct = target != null ? (target / max) * 100 : null;

  let fillLeft = baselinePct;
  let fillWidth = 0;
  if (currentPct != null && targetPct != null) {
    if (targetPct >= baselinePct) {
      // Ascending: fill rightward from baseline, capped at target.
      const right = Math.min(currentPct, targetPct);
      fillLeft = baselinePct;
      fillWidth = Math.max(0, right - baselinePct);
    } else {
      // Descending: fill leftward from baseline, capped at target.
      const left = Math.max(currentPct, targetPct);
      fillLeft = left;
      fillWidth = Math.max(0, baselinePct - left);
    }
  } else if (currentPct != null) {
    // No target yet — span baseline ↔ current in either direction.
    fillLeft = Math.min(baselinePct, currentPct);
    fillWidth = Math.abs(currentPct - baselinePct);
  }

  return { fillLeft, fillWidth, targetPct };
}

/**
 * Return a human-readable progress label for a goal percentage.
 * Single source of truth — used by GoalsCard and GoalsPage.
 */
export function goalProgressLabel(pct: number): string {
  if (pct >= GOAL_PROGRESS_COMPLETE_PCT) return "Goal reached — ready for review";
  if (pct >= GOAL_PROGRESS_HIGH_PCT) return `${pct}% — in the final stretch`;
  if (pct >= GOAL_PROGRESS_LOW_PCT) return `${pct}% — building momentum`;
  return `${pct}% — just getting started`;
}

const goalFieldsSchema = z.object({
  title: z.string().min(1).max(GOAL_TITLE_MAX_LENGTH),
  metric: z.string().max(50).optional().nullable(),
  baseline: z.number().int().min(0).max(100).optional().nullable(),
  target: z.number().int().min(0).max(100).optional().nullable(),
  current: z.number().int().min(0).max(100).optional().nullable(),
  notes: z.string().max(GOAL_NOTES_MAX_LENGTH).optional().nullable(),
});

/** Schema for creating a new clinical goal (admin only) */
export const goalCreateSchema = goalFieldsSchema;

/** Schema for updating an existing clinical goal (all fields optional, plus completed flag) */
export const goalUpdateSchema = goalFieldsSchema.partial().extend({
  completed: z.boolean().optional(),
});
