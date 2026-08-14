"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "../portal.module.css";
import checkinStyles from "./checkin.module.css";
import { CheckinTrendChart } from "@/components/portal/CheckinTrendChart";
import { CHECKIN_SCALE_MIN, CHECKIN_SCALE_MAX, SAVED_FEEDBACK_MS, SAVING_LABEL, SAVED_LABEL, CHECKIN_METRICS, CHECKIN_NOTES_MAX_LENGTH, CHECKIN_DISPLAY_DAYS, type MetricKey } from "@/lib/config/portal";
import { PORTAL_ROUTES } from "@/lib/config/routes";
import { formatDateISO, formatDateMonthDay, sentenceCase } from "@/lib/utils/format";
import { computeStreak, streakMessage } from "@/lib/domain/checkin";
import { LoadingState } from "@/components/LoadingState";


type CheckinData = { date: string; notes: string } & Record<MetricKey, number>;

type StoredCheckin = Omit<CheckinData, "notes"> & { notes: string | null; id: string };



const SCALE = Array.from(
  { length: CHECKIN_SCALE_MAX - CHECKIN_SCALE_MIN + 1 },
  (_, i) => i + CHECKIN_SCALE_MIN
);

function todayISO() {
  return formatDateISO(new Date());
}

export function CheckinForm({ clinician }: { clinician: string }) {
  const today = todayISO();

  const [form, setForm] = useState<CheckinData>({
    date: today,
    sleep: 0,
    energy: 0,
    mood: 0,
    focus: 0,
    stress: 0,
    notes: "",
  });
  const [history, setHistory] = useState<StoredCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const alreadyCheckedIn = history.some((c) => c.date === today) && !saving;

  useEffect(() => {
    fetch("/api/checkin")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setHistory(res.data.checkins);
          if (res.data.todayCheckin) {
            const tc = res.data.todayCheckin;
            setForm({
              date: tc.date,
              sleep: tc.sleep,
              energy: tc.energy,
              mood: tc.mood,
              focus: tc.focus,
              stress: tc.stress,
              notes: tc.notes ?? "",
            });
          }
        } else {
          setLoadError(true);
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (CHECKIN_METRICS.some(({ key }) => form[key] === 0)) return; // all metrics required
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSaveError("Failed to save check-in. Please try again.");
        return;
      }
      setSaved(true);
      setHistory((prev) => {
        const without = prev.filter((c) => c.date !== today);
        const updated: StoredCheckin = { id: "", ...form, notes: form.notes || null };
        return [...without, updated].sort((a, b) => a.date.localeCompare(b.date));
      });
      setTimeout(() => setSaved(false), SAVED_FEEDBACK_MS);
    } catch {
      setSaveError("Failed to save check-in. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function setMetric(key: MetricKey, value: number) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const chartData = history.map((c) => ({
    date: formatDateMonthDay(c.date + "T00:00:00"),
    ...Object.fromEntries(CHECKIN_METRICS.map(({ key }) => [key, c[key]])) as Record<MetricKey, number>,
  }));

  const filledCount = CHECKIN_METRICS.filter(({ key }) => form[key] > 0).length;
  const allFilled = filledCount === CHECKIN_METRICS.length;
  const inProgress = filledCount > 0 && !allFilled;
  const streak = computeStreak(history);

  if (loading) return <LoadingState />;
  if (loadError) return <div className={styles.emptyState}>Failed to load your check-in history. Please refresh the page.</div>;

  return (
    <div>
      <h1 className={styles.pageTitle}>
        Daily <em>Check-in</em>
      </h1>
      <p className={styles.pageSub}>Track your wellbeing — takes 30 seconds</p>

      <div className={checkinStyles.layout}>
        {/* Post-save success panel */}
        {saved && (
          <div className={styles.cardMuted}>
            <div className={checkinStyles.successTop}>
              <span className={checkinStyles.successCheck}>✓</span>
              <div>
                <p className={checkinStyles.successTitle}>Check-in saved</p>
                <p className={checkinStyles.successStreak}>{streakMessage(streak)}</p>
              </div>
            </div>
            <p className={checkinStyles.successBody}>
              Each data point refines your pattern. {sentenceCase(clinician)} reviews your trend before every consultation — this is the raw material of your programme.
            </p>
            <div className={checkinStyles.successLinks}>
              <Link href={PORTAL_ROUTES.dashboard} className={checkinStyles.successLinkPrimary}>Back to dashboard →</Link>
              <Link href={PORTAL_ROUTES.assessments} className={checkinStyles.successLinkMuted}>View full results</Link>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className={styles.card}>
          <p className={styles.cardTitle}>
            {alreadyCheckedIn ? "Today's check-in — update" : "Today's check-in"}
          </p>
          {streak >= 2 && !saved && (
            <p className={checkinStyles.streakBadge}>🔥 {streak}-day streak</p>
          )}

          <div className={checkinStyles.metrics}>
            {CHECKIN_METRICS.map(({ key, label, lowLabel, highLabel }) => (
              <div key={key} className={`${checkinStyles.metricRow}${inProgress && form[key] === 0 ? ` ${checkinStyles.metricRowEmpty}` : ""}`}>
                <div className={checkinStyles.metricLabel}>{label}</div>
                <div className={checkinStyles.scaleWrap}>
                  <span className={checkinStyles.scaleEdge}>{lowLabel}</span>
                  <div className={checkinStyles.buttons}>
                    {SCALE.map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={`${checkinStyles.scaleBtn} ${form[key] === v ? checkinStyles.scaleBtnActive : ""}`}
                        onClick={() => setMetric(key, v)}
                        aria-label={`${label}: ${v}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <span className={checkinStyles.scaleEdge}>{highLabel}</span>
                </div>
              </div>
            ))}
          </div>

          <div className={checkinStyles.notesField}>
            <label className={checkinStyles.notesLabel} htmlFor="checkin-notes">
              Notes <span className={checkinStyles.optional}>(optional)</span>
            </label>
            <textarea
              id="checkin-notes"
              className={styles.formTextarea}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              maxLength={CHECKIN_NOTES_MAX_LENGTH}
              placeholder="Anything worth noting today?"
            />
          </div>

          {saveError && <p className={styles.formErrorTop}>{saveError}</p>}
          <button
            type="submit"
            className={`${styles.btnPrimary} ${styles.btnBlock}`}
            disabled={saving || !allFilled}
          >
            {saving ? SAVING_LABEL : saved ? SAVED_LABEL : alreadyCheckedIn ? "Update check-in" : "Save check-in"}
          </button>
          {!allFilled && !saving && (
            <p className={checkinStyles.submitHint}>
              {filledCount} / {CHECKIN_METRICS.length} metrics filled — select a value for each one above
            </p>
          )}
        </form>

        {/* History chart */}
        {history.length > 1 && (
          <div className={styles.card}>
            <p className={styles.cardTitle}>Trend — last {history.length} days</p>
            <CheckinTrendChart data={chartData} />
          </div>
        )}

        {/* Past check-ins list — shows notes and scores, newest first, skips today, capped at CHECKIN_DISPLAY_DAYS */}
        {(() => {
          const allPast = [...history]
            .filter((c) => c.date !== today)
            .sort((a, b) => b.date.localeCompare(a.date));
          const past = allPast.slice(0, CHECKIN_DISPLAY_DAYS);
          if (past.length === 0) return null;
          return (
            <div className={styles.card}>
              <p className={styles.cardTitle}>Recent check-ins</p>
              <div className={checkinStyles.historyList}>
                {past.map((c) => (
                  <div key={c.id || c.date} className={checkinStyles.historyRow}>
                    <div className={checkinStyles.historyDate}>
                      {formatDateMonthDay(c.date + "T00:00:00")}
                    </div>
                    <div className={checkinStyles.historyScores}>
                      {CHECKIN_METRICS.map(({ key, shortLabel }) => (
                        <span key={key} className={checkinStyles.historyScore}>
                          <span className={checkinStyles.historyScoreLabel}>{shortLabel}</span>
                          <span className={checkinStyles.historyScoreValue}>{c[key]}</span>
                        </span>
                      ))}
                    </div>
                    {c.notes && (
                      <p className={checkinStyles.historyNote}>{c.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
