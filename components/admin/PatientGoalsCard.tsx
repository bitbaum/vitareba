"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "@/app/(admin)/admin.module.css";
import { type GoalRow, GOAL_TITLE_MAX_LENGTH, GOAL_NOTES_MAX_LENGTH, CHECKIN_METRICS, ASSESSMENT_GOAL_METRIC_KEY, ASSESSMENT_GOAL_METRIC_LABEL } from "@/lib/config/portal";
import { goalBarGeometry } from "@/lib/domain/goals";
import { LoadingState } from "@/components/LoadingState";

const GOAL_METRIC_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "None — track manually" },
  { value: ASSESSMENT_GOAL_METRIC_KEY, label: ASSESSMENT_GOAL_METRIC_LABEL },
  ...CHECKIN_METRICS.map((m) => ({ value: m.key, label: `Check-in: ${m.label}` })),
];

function GoalProgressBar({ baseline, current, target }: { baseline: number | null; current: number | null; target: number | null }) {
  const geom = goalBarGeometry(baseline, current, target);
  if (!geom) return null;
  const { fillLeft, fillWidth, targetPct } = geom;

  return (
    <div className={styles.goalBar}>
      {fillWidth > 0 && (
        <div className={styles.goalBarFill} style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }} />
      )}
      {targetPct != null && (
        <div className={styles.goalBarTarget} style={{ left: `${targetPct}%` }} />
      )}
    </div>
  );
}

export function PatientGoalsCard({ patientId }: { patientId: string }) {
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", metric: "", baseline: "", target: "", current: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCurrent, setEditCurrent] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/patients/${patientId}/goals`);
      if (!res.ok) { setLoadError(true); return; }
      const data = await res.json();
      setGoals(data.data ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/patients/${patientId}/goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          metric: form.metric || null,
          baseline: form.baseline !== "" ? Number(form.baseline) : null,
          target: form.target !== "" ? Number(form.target) : null,
          current: form.current !== "" ? Number(form.current) : null,
          notes: form.notes || null,
        }),
      });
      if (!res.ok) { setActionError("Failed to add goal."); return; }
      setForm({ title: "", metric: "", baseline: "", target: "", current: "", notes: "" });
      setShowForm(false);
      load();
    } catch {
      setActionError("Failed to add goal.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateCurrent(goalId: string) {
    if (editCurrent === "") return;
    setActionError("");
    try {
      const res = await fetch(`/api/admin/goals/${goalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current: Number(editCurrent) }),
      });
      if (!res.ok) { setActionError("Failed to update score."); return; }
      setEditingId(null);
      setEditCurrent("");
      load();
    } catch {
      setActionError("Failed to update score.");
    }
  }

  async function handleToggleComplete(goal: GoalRow) {
    setActionError("");
    try {
      const res = await fetch(`/api/admin/goals/${goal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !goal.completedAt }),
      });
      if (!res.ok) { setActionError("Failed to update goal."); return; }
      load();
    } catch {
      setActionError("Failed to update goal.");
    }
  }

  async function handleDelete(goalId: string) {
    setActionError("");
    try {
      const res = await fetch(`/api/admin/goals/${goalId}`, { method: "DELETE" });
      if (!res.ok) { setActionError("Failed to delete goal."); return; }
      load();
    } catch {
      setActionError("Failed to delete goal.");
    }
  }

  const active = goals.filter((g) => !g.completedAt);
  const completed = goals.filter((g) => g.completedAt);

  return (
    <div className={styles.goalCardMt}>
      <div className={styles.goalCardHeader}>
        <p className={styles.cardLabel}>Clinical goals ({goals.length})</p>
        <button type="button" onClick={() => setShowForm(!showForm)} className={styles.goalAddBtn}>
          + Add goal
        </button>
      </div>
      {actionError && <p className={styles.formError}>{actionError}</p>}

      {showForm && (
        <form onSubmit={handleAdd} className={styles.goalForm}>
          <input
            required
            aria-label="Goal title"
            placeholder="Goal title (e.g. Improve focus score to 70)"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            maxLength={GOAL_TITLE_MAX_LENGTH}
            className={styles.goalFormInput}
          />
          <select
            aria-label="Auto-update metric (optional)"
            value={form.metric}
            onChange={(e) => setForm((p) => ({ ...p, metric: e.target.value }))}
            className={styles.goalFormSelect}
          >
            {GOAL_METRIC_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div className={styles.goalFormGrid3}>
            <input
              type="number" min="0" max="100"
              aria-label="Baseline score (0–100)"
              placeholder="Baseline (0–100)"
              value={form.baseline}
              onChange={(e) => setForm((p) => ({ ...p, baseline: e.target.value }))}
              className={styles.goalFormInput}
            />
            <input
              type="number" min="0" max="100"
              aria-label="Current score (0–100)"
              placeholder="Current (0–100)"
              value={form.current}
              onChange={(e) => setForm((p) => ({ ...p, current: e.target.value }))}
              className={styles.goalFormInput}
            />
            <input
              type="number" min="0" max="100"
              aria-label="Target score (0–100)"
              placeholder="Target (0–100)"
              value={form.target}
              onChange={(e) => setForm((p) => ({ ...p, target: e.target.value }))}
              className={styles.goalFormInput}
            />
          </div>
          <textarea
            aria-label="Notes"
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            rows={2}
            maxLength={GOAL_NOTES_MAX_LENGTH}
            className={styles.goalFormTextarea}
          />
          <div className={styles.goalFormActions}>
            <button type="submit" disabled={saving} className={styles.goalFormSubmit}>
              {saving ? "Saving…" : "Add goal"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} aria-label="Cancel adding new goal" className={styles.goalFormCancel}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <LoadingState />
      ) : loadError ? (
        <p className={styles.goalMutedText}>
          Failed to load goals.{" "}
          <button type="button" onClick={load} className={styles.goalRetryBtn}>
            Retry
          </button>
        </p>
      ) : goals.length === 0 ? (
        <p className={styles.goalMutedText}>No goals set yet.</p>
      ) : (
        <div className={styles.goalList}>
          {active.map((goal) => (
            <div key={goal.id} className={styles.goalActiveItem}>
              <div className={styles.goalItemHeader}>
                <p className={styles.goalTitle}>{goal.title}</p>
                <div className={styles.goalItemActions}>
                  <button type="button" onClick={() => handleToggleComplete(goal)} aria-label={`Mark "${goal.title}" as complete`} className={styles.goalDoneBtn}>
                    ✓ Done
                  </button>
                  <button type="button" onClick={() => handleDelete(goal.id)} aria-label={`Delete goal "${goal.title}"`} className={styles.goalDeleteBtn}>
                    ✕
                  </button>
                </div>
              </div>
              {(goal.baseline != null || goal.current != null || goal.target != null) && (
                <>
                  <GoalProgressBar baseline={goal.baseline} current={goal.current} target={goal.target} />
                  <p className={styles.goalStats}>
                    {goal.baseline != null && `Baseline: ${goal.baseline}`}
                    {goal.current != null && ` · Current: ${goal.current}`}
                    {goal.target != null && ` · Target: ${goal.target}`}
                  </p>
                </>
              )}
              {editingId === goal.id ? (
                <div className={styles.goalEditRow}>
                  <input
                    type="number" min="0" max="100"
                    aria-label="New score (0–100)"
                    value={editCurrent}
                    onChange={(e) => setEditCurrent(e.target.value)}
                    placeholder="New score"
                    className={styles.goalEditInput}
                    autoFocus
                  />
                  <button type="button" onClick={() => handleUpdateCurrent(goal.id)} aria-label={`Save score update for "${goal.title}"`} className={styles.goalEditSave}>
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} aria-label={`Cancel score edit for "${goal.title}"`} className={styles.goalEditCancel}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setEditingId(goal.id); setEditCurrent(goal.current?.toString() ?? ""); }}
                  className={styles.goalUpdateLink}
                >
                  Update score
                </button>
              )}
              {goal.metric && (
                <p className={styles.goalMetricTag}>
                  Auto-updated from: {GOAL_METRIC_OPTIONS.find((o) => o.value === goal.metric)?.label ?? goal.metric}
                </p>
              )}
              {goal.notes && <p className={styles.goalNotes}>{goal.notes}</p>}
            </div>
          ))}

          {completed.length > 0 && (
            <details className={styles.goalCompletedDetails}>
              <summary className={styles.goalCompletedSummary}>
                {completed.length} completed goal{completed.length !== 1 ? "s" : ""}
              </summary>
              <div className={styles.goalCompletedList}>
                {completed.map((goal) => (
                  <div key={goal.id} className={styles.goalCompletedItem}>
                    <div className={styles.goalCompletedHeader}>
                      <p className={styles.goalCompletedTitle}>{goal.title}</p>
                      <div className={styles.goalCompletedActions}>
                        <button type="button" onClick={() => handleToggleComplete(goal)} aria-label={`Reopen goal "${goal.title}"`} className={styles.goalCompletedBtn}>
                          Reopen
                        </button>
                        <button type="button" onClick={() => handleDelete(goal.id)} aria-label={`Delete goal "${goal.title}"`} className={styles.goalCompletedBtn}>
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
