"use client";

import { useState } from "react";
import styles from "@/app/(admin)/admin.module.css";
import { SAVED_FEEDBACK_MS, PATIENT_NOTE_MAX_LENGTH } from "@/lib/config/portal";
import {
  PROGRAMME_CONFIG,
  PHASE_CONFIG,
  PROGRAMME_ENUM_VALUES,
  PHASE_ENUM_VALUES,
  phaseDescription,
} from "@/lib/config/programmes";
import type { ProgrammeKey, PhaseKey } from "@/lib/config/programmes";

type Assignment = {
  programme: ProgrammeKey;
  phase: PhaseKey;
  startDate: string | null;
  notes: string | null;
};

export function ProgrammeAssignmentForm({
  patientId,
  initial,
  clinician,
}: {
  patientId: string;
  initial: Assignment | null;
  /** This patient's clinician, so the preview shows the copy they will read. */
  clinician: string;
}) {
  const [programme, setProgramme] = useState<ProgrammeKey | "">(initial?.programme ?? "");
  const [phase, setPhase] = useState<PhaseKey | "">(initial?.phase ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!programme || !phase) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/patients/${patientId}/programme`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programme,
          phase,
          startDate: startDate || null,
          notes: notes || null,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setError("Failed to save assignment.");
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), SAVED_FEEDBACK_MS);
    } catch {
      setError("Failed to save assignment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.formStack}>
      <div className={styles.formGrid2}>
        <div>
          <label htmlFor="prog-programme" className={styles.assignLabel}>
            Programme
          </label>
          <select
            id="prog-programme"
            value={programme}
            onChange={(e) => setProgramme(e.target.value as ProgrammeKey)}
            className={styles.assignField}
          >
            <option value="">Select programme…</option>
            {PROGRAMME_ENUM_VALUES.map((key) => (
              <option key={key} value={key}>
                {PROGRAMME_CONFIG[key].label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="prog-phase" className={styles.assignLabel}>
            Phase
          </label>
          <select
            id="prog-phase"
            value={phase}
            onChange={(e) => setPhase(e.target.value as PhaseKey)}
            className={styles.assignField}
          >
            <option value="">Select phase…</option>
            {PHASE_ENUM_VALUES.map((key) => (
              <option key={key} value={key}>
                {PHASE_CONFIG[key].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="prog-start-date" className={styles.assignLabel}>
          Start date (optional)
        </label>
        <input
          id="prog-start-date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className={styles.assignField}
        />
      </div>

      <div>
        <label htmlFor="prog-notes" className={styles.assignLabel}>
          Notes (optional)
        </label>
        <textarea
          id="prog-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={PATIENT_NOTE_MAX_LENGTH}
          placeholder="Any notes about this assignment…"
          className={styles.assignFieldTextarea}
        />
      </div>

      {programme && phase && (
        <div className={styles.assignPreview}>
          <strong className={styles.assignPreviewLabel}>
            {PROGRAMME_CONFIG[programme as ProgrammeKey]?.label}
          </strong>
          {" — "}
          {phaseDescription(phase as PhaseKey, clinician)}
        </div>
      )}

      {error && <p className={styles.assignError}>{error}</p>}

      <button
        type="submit"
        disabled={saving || !programme || !phase}
        className={styles.assignSubmit}
      >
        {saving
          ? "Saving…"
          : saved
            ? "Saved ✓"
            : initial
              ? "Update assignment"
              : "Assign programme"}
      </button>
    </form>
  );
}
