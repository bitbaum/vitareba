"use client";

/**
 * The clinical measurement view — one component, two audiences.
 *
 * The server decides what this viewer may do (`canRecordClinical` comes back
 * with the data, never from a prop), so a patient and their clinician see the
 * same numbers rendered by the same code, and the difference between them is
 * enforced where it can actually be enforced. Two near-identical panels would
 * eventually disagree about what a value means, and the one place that must
 * never happen is a page showing someone their own blood results.
 *
 * Reading order is deliberate: anything that needs acting on today first, then
 * the derived numbers that only exist as combinations, then the record itself.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import shared from "@/app/shared.module.css";
import forms from "@/app/forms.module.css";
import { LoadingState } from "@/components/LoadingState";
import {
  MEASUREMENT_CATEGORIES,
  MEASUREMENT_DEFS,
  MEASUREMENT_SOURCES,
  PATIENT_ENTERABLE_KEYS,
  measurementDef,
  type BiologicalSex,
} from "@/lib/config/measurements";
import {
  bmi,
  computeTrend,
  formatRange,
  formatValue,
  homaIr,
  nonHdl,
  readMeasurement,
  resolveRange,
  type MeasurementPoint,
} from "@/lib/domain/measurements";
import { formatDateShort } from "@/lib/utils/format";
import { SAVING_LABEL } from "@/lib/config/portal";

type MeasurementRow = {
  id: string;
  kind: string;
  value: number;
  measuredAt: string;
  source: string;
  note: string | null;
};

type PanelData = {
  measurements: MeasurementRow[];
  biologicalSex: BiologicalSex | null;
  canRecordClinical: boolean;
};

type EntryDraft = { kind: string; value: string };

const EMPTY_DRAFT: EntryDraft = { kind: "", value: "" };

export function MeasurementsPanel({ patientId }: { patientId?: string }) {
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showUnmeasured, setShowUnmeasured] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [measuredAt, setMeasuredAt] = useState(today());
  const [source, setSource] = useState("");
  const [drafts, setDrafts] = useState<EntryDraft[]>([{ ...EMPTY_DRAFT }]);

  const query = patientId ? `?patientId=${encodeURIComponent(patientId)}` : "";

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/measurements${query}`);
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const body = await res.json();
      setData(body.data ?? null);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const sex = data?.biologicalSex ?? null;
  const canRecordClinical = data?.canRecordClinical ?? false;

  /** Every marker's series, newest last, keyed by marker. */
  const byKind = useMemo(() => {
    const map = new Map<string, MeasurementRow[]>();
    for (const row of data?.measurements ?? []) {
      const list = map.get(row.kind) ?? [];
      list.push(row);
      map.set(row.kind, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    }
    return map;
  }, [data]);

  const latestOf = useCallback(
    (kind: string): MeasurementRow | undefined => {
      const list = byKind.get(kind);
      return list?.[list.length - 1];
    },
    [byKind]
  );

  // Values that crossed a recognised action threshold. Deliberately built from
  // the LATEST value only — a blood pressure that was once 190 and has been
  // normal for six months is history, not an alert.
  const alerts = useMemo(() => {
    const out: { label: string; text: string }[] = [];
    for (const def of MEASUREMENT_DEFS) {
      const latest = latestOf(def.key);
      if (!latest) continue;
      const reading = readMeasurement(def.key, latest.value, sex);
      if (!reading.needsAttention) continue;
      out.push({
        label: def.label,
        text: `${formatValue(def.key, latest.value)} ${def.unit} on ${formatDateShort(latest.measuredAt)} — ${def.alertSource ?? "outside the range that can wait"}`,
      });
    }
    return out;
  }, [latestOf, sex]);

  const derived = useMemo(() => computeDerived(latestOf), [latestOf]);

  // Which markers this viewer is allowed to submit. A patient sees the vitals
  // they can take; a clinician sees everything.
  const enterableDefs = useMemo(
    () =>
      MEASUREMENT_DEFS.filter(
        (d) => canRecordClinical || (PATIENT_ENTERABLE_KEYS as readonly string[]).includes(d.key)
      ),
    [canRecordClinical]
  );

  const sourceOptions = useMemo(
    () =>
      MEASUREMENT_SOURCES.filter(
        (s) => canRecordClinical || s.key === "home" || s.key === "wearable"
      ),
    [canRecordClinical]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setActionError("");

    const entries = drafts
      .filter((d) => d.kind && d.value.trim() !== "")
      .map((d) => ({ kind: d.kind, value: Number(d.value) }));

    if (entries.length === 0) {
      setActionError("Add at least one result.");
      return;
    }
    if (entries.some((e) => !Number.isFinite(e.value))) {
      setActionError("Every result needs a number.");
      return;
    }
    if (!source) {
      setActionError("Choose where this result came from.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, measuredAt, source, entries }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setActionError(body?.error ?? "Could not save these results.");
        return;
      }
      setDrafts([{ ...EMPTY_DRAFT }]);
      setShowForm(false);
      await load();
    } catch {
      setActionError("Could not save these results.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setActionError("");
    try {
      const res = await fetch(`/api/measurements/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setActionError(body?.error ?? "Could not remove that result.");
        return;
      }
      await load();
    } catch {
      setActionError("Could not remove that result.");
    }
  }

  if (loading) return <LoadingState />;
  if (loadError || !data) {
    return <p className={shared.formError}>Could not load results. Reload to try again.</p>;
  }

  const measuredCount = byKind.size;

  return (
    <div>
      {alerts.length > 0 && (
        <div className={shared.mAlertBanner}>
          <p className={shared.mAlertTitle}>Needs review</p>
          {alerts.map((a) => (
            <p key={a.label} className={shared.mAlertItem}>
              <strong>{a.label}:</strong> {a.text}
            </p>
          ))}
        </div>
      )}

      <div className={shared.mToolbar}>
        <p className={shared.progressLabel}>
          {measuredCount === 0
            ? "No results recorded yet."
            : `${measuredCount} marker${measuredCount === 1 ? "" : "s"} with results.`}
          {sexCaveat(sex, byKind)}
        </p>
        <div className={shared.formActions}>
          <button
            type="button"
            className={shared.btnText}
            onClick={() => setShowUnmeasured((v) => !v)}
          >
            {showUnmeasured ? "Hide untested markers" : "Show untested markers"}
          </button>
          <button
            type="button"
            className={shared.btnSecondary}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "Record results"}
          </button>
        </div>
      </div>

      {actionError && <p className={shared.formErrorTop}>{actionError}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className={shared.cardMb}>
          <div className={shared.mEntryGrid}>
            <div className={forms.field}>
              <label className={forms.label} htmlFor="m-date">
                Date of the result
              </label>
              <input
                id="m-date"
                type="date"
                className={forms.input}
                value={measuredAt}
                max={today()}
                onChange={(e) => setMeasuredAt(e.target.value)}
                required
              />
            </div>
            <div className={forms.field}>
              <label className={forms.label} htmlFor="m-source">
                Where it came from
              </label>
              <select
                id="m-source"
                className={forms.input}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                required
              >
                <option value="">Choose…</option>
                {sourceOptions.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <span />
          </div>

          {drafts.map((draft, i) => (
            <div key={i} className={shared.mEntryGrid}>
              <div className={forms.field}>
                <label className={forms.label} htmlFor={`m-kind-${i}`}>
                  Marker
                </label>
                <select
                  id={`m-kind-${i}`}
                  className={forms.input}
                  value={draft.kind}
                  onChange={(e) => updateDraft(setDrafts, i, { kind: e.target.value })}
                >
                  <option value="">Choose…</option>
                  {MEASUREMENT_CATEGORIES.map((cat) => {
                    const defs = enterableDefs.filter((d) => d.category === cat.key);
                    if (defs.length === 0) return null;
                    return (
                      <optgroup key={cat.key} label={cat.label}>
                        {defs.map((d) => (
                          <option key={d.key} value={d.key}>
                            {d.label} ({d.unit})
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
              <div className={forms.field}>
                <label className={forms.label} htmlFor={`m-value-${i}`}>
                  {draft.kind ? `Value in ${measurementDef(draft.kind)?.unit}` : "Value"}
                </label>
                <input
                  id={`m-value-${i}`}
                  type="number"
                  step="any"
                  inputMode="decimal"
                  className={forms.input}
                  value={draft.value}
                  onChange={(e) => updateDraft(setDrafts, i, { value: e.target.value })}
                />
              </div>
              {drafts.length > 1 ? (
                <button
                  type="button"
                  className={shared.btnText}
                  onClick={() => setDrafts((d) => d.filter((_, j) => j !== i))}
                  aria-label="Remove this row"
                >
                  Remove
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}

          <div className={shared.formActions}>
            <button
              type="button"
              className={shared.btnText}
              onClick={() => setDrafts((d) => [...d, { ...EMPTY_DRAFT }])}
            >
              + Another marker
            </button>
            <button type="submit" className={shared.btnPrimary} disabled={saving}>
              {saving ? SAVING_LABEL : "Save results"}
            </button>
          </div>
          <p className={shared.formHint}>
            A whole laboratory panel goes in as one entry — one date, one source, as many markers as
            the report carries.
          </p>
        </form>
      )}

      {derived.length > 0 && (
        <div className={shared.mDerived}>
          {derived.map((d) => (
            <div key={d.label} className={shared.mDerivedItem}>
              <span className={shared.mDerivedLabel}>{d.label}</span>
              <span className={shared.mValue}>
                {d.value}
                <span className={shared.mUnit}>{d.hint}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {MEASUREMENT_CATEGORIES.map((cat) => {
        const defs = MEASUREMENT_DEFS.filter(
          (d) => d.category === cat.key && (showUnmeasured || byKind.has(d.key))
        );
        if (defs.length === 0) return null;
        return (
          <section key={cat.key} className={shared.mCategory}>
            <p className={shared.mCategoryTitle}>{cat.label}</p>
            {defs.map((def) => {
              const series = byKind.get(def.key) ?? [];
              const latest = series[series.length - 1];
              const isOpen = expanded === def.key;
              return (
                <div key={def.key}>
                  <button
                    type="button"
                    className={shared.mRow}
                    onClick={() => setExpanded(isOpen ? null : def.key)}
                    aria-expanded={isOpen}
                  >
                    <span className={shared.mLabel}>{def.label}</span>
                    {latest ? (
                      <>
                        <span className={shared.mValue}>
                          {formatValue(def.key, latest.value)}
                          <span className={shared.mUnit}>{def.unit}</span>
                        </span>
                        <StatusPill kind={def.key} value={latest.value} sex={sex} />
                        <TrendLabel kind={def.key} series={series} sex={sex} />
                        <span className={shared.mDate}>{formatDateShort(latest.measuredAt)}</span>
                      </>
                    ) : (
                      <>
                        <span className={shared.mRange}>—</span>
                        <span className={shared.mStatusUnrated}>Not tested</span>
                        <span />
                        <span />
                      </>
                    )}
                  </button>

                  {isOpen && (
                    <div className={shared.mDetail}>
                      {def.plain && <p className={shared.mDetailNote}>{def.plain}</p>}
                      <p className={shared.mDetailNote}>
                        {intervalSentence(def.key, sex)}
                        {def.source ? ` ${def.source}.` : ""}
                      </p>
                      {series.length === 0 ? (
                        <p className={shared.mHistoryMeta}>No results recorded.</p>
                      ) : (
                        [...series].reverse().map((row) => (
                          <div key={row.id} className={shared.mHistoryRow}>
                            <span>
                              {formatValue(def.key, row.value)} {def.unit}
                              {row.note ? ` · ${row.note}` : ""}
                            </span>
                            <span className={shared.mHistoryMeta}>
                              {formatDateShort(row.measuredAt)} · {sourceLabel(row.source)}
                              {(canRecordClinical || isSelfRecorded(row.source)) && (
                                <>
                                  {" · "}
                                  <button
                                    type="button"
                                    className={shared.btnText}
                                    onClick={() => handleDelete(row.id)}
                                  >
                                    Remove
                                  </button>
                                </>
                              )}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function StatusPill({
  kind,
  value,
  sex,
}: {
  kind: string;
  value: number;
  sex: BiologicalSex | null;
}) {
  const reading = readMeasurement(kind, value, sex);
  if (reading.needsAttention) {
    return <span className={shared.mStatusAlert}>Review</span>;
  }
  if (reading.status === "below") return <span className={shared.mStatusOut}>Below range</span>;
  if (reading.status === "above") return <span className={shared.mStatusOut}>Above range</span>;
  if (reading.status === "unrated") return <span className={shared.mStatusUnrated}>Tracked</span>;
  // Hitting the narrower guideline target is worth saying — but MISSING it is
  // still "in range", in the same colour, because a target is not a boundary and
  // a patient must never be shown as abnormal for sitting inside normal.
  return (
    <span className={shared.mStatusWithin}>{reading.atOptimal ? "Optimal" : "In range"}</span>
  );
}

function TrendLabel({
  kind,
  series,
  sex,
}: {
  kind: string;
  series: MeasurementRow[];
  sex: BiologicalSex | null;
}) {
  const points: MeasurementPoint[] = series.map((r) => ({
    value: r.value,
    measuredAt: new Date(r.measuredAt),
  }));
  const trend = computeTrend(kind, points, sex);
  if (trend.verdict === "unknown") {
    return <span className={shared.mTrend}>First result</span>;
  }

  const arrow = trend.delta > 0 ? "↑" : trend.delta < 0 ? "↓" : "→";
  const size = `${trend.delta > 0 ? "+" : ""}${formatValue(kind, trend.delta)}`;
  const cls =
    trend.verdict === "improving"
      ? shared.mTrendImproving
      : trend.verdict === "worsening"
        ? shared.mTrendWorsening
        : shared.mTrendSteady;

  return (
    <span className={`${shared.mTrend} ${cls}`}>
      {trend.verdict === "steady" ? "Steady" : `${arrow} ${size}`}
    </span>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function updateDraft(
  set: React.Dispatch<React.SetStateAction<EntryDraft[]>>,
  index: number,
  patch: Partial<EntryDraft>
) {
  set((drafts) => drafts.map((d, i) => (i === index ? { ...d, ...patch } : d)));
}

function isSelfRecorded(source: string): boolean {
  return source === "home" || source === "wearable";
}

function sourceLabel(source: string): string {
  return MEASUREMENT_SOURCES.find((s) => s.key === source)?.label ?? source;
}

/** The interval, said in words, with an honest note when sex would change it. */
function intervalSentence(kind: string, sex: BiologicalSex | null): string {
  const def = measurementDef(kind);
  if (!def) return "";
  const { range, sexSpecific } = resolveRange(def, sex);
  const text = formatRange(kind, range);
  if (!text) {
    return "There is no population reference interval for this — read the trend, not the number.";
  }
  const optimal = def.optimal ? formatRange(kind, def.optimal) : null;
  const target = optimal ? ` Guideline target ${optimal} ${def.unit}.` : "";
  const caveat =
    !sexSpecific && (def.refFemale || def.refMale)
      ? " This interval differs by sex; add it to the profile for a tailored range."
      : "";
  return `Reference interval ${text} ${def.unit}.${target}${caveat}`;
}

function sexCaveat(sex: BiologicalSex | null, byKind: Map<string, unknown>): string {
  if (sex === "female" || sex === "male") return "";
  const affected = MEASUREMENT_DEFS.filter(
    (d) => (d.refFemale || d.refMale) && byKind.has(d.key)
  ).length;
  if (affected === 0) return "";
  // "1 of them are" reads as a bug to the clinician who spots it, and quietly
  // costs credibility on a page full of numbers.
  const verb = affected === 1 ? "is" : "are";
  return ` ${affected} of them ${verb} read against a sex-specific interval that is not set.`;
}

/**
 * Numbers that only exist as combinations. Computed here, never stored — a BMI
 * saved beside its own weight and height goes stale the moment either changes.
 */
function computeDerived(
  latestOf: (kind: string) => MeasurementRow | undefined
): { label: string; value: string; hint: string }[] {
  const out: { label: string; value: string; hint: string }[] = [];

  const weight = latestOf("weight");
  const height = latestOf("height");
  if (weight && height) {
    const v = bmi(weight.value, height.value);
    if (v !== null) out.push({ label: "BMI", value: v.toFixed(1), hint: "kg/m²" });
  }

  const glucose = latestOf("glucose_fasting");
  const insulin = latestOf("insulin_fasting");
  if (glucose && insulin) {
    const v = homaIr(glucose.value, insulin.value);
    if (v !== null) out.push({ label: "HOMA-IR", value: v.toFixed(2), hint: "insulin resistance" });
  }

  const total = latestOf("cholesterol_total");
  const hdl = latestOf("hdl");
  if (total && hdl) {
    const v = nonHdl(total.value, hdl.value);
    if (v !== null) out.push({ label: "Non-HDL", value: v.toFixed(2), hint: "mmol/L" });
  }

  return out;
}
