"use client";

import { useState } from "react";
import styles from "@/app/(admin)/admin.module.css";
import {
  SAVED_FEEDBACK_MS,
  EXERCISE_FREQUENCY_OPTIONS,
  SLEEP_HOURS_MIN,
  SLEEP_HOURS_MAX,
  PATIENT_NOTE_MAX_LENGTH,
  PROFILE_NAME_MAX_LENGTH,
  PROFILE_PHONE_MAX_LENGTH,
  PROFILE_CITY_MAX_LENGTH,
  PROFILE_OCCUPATION_MAX_LENGTH,
  PROFILE_REFERRAL_SOURCE_MAX_LENGTH,
  PROFILE_DOB_MAX_LENGTH,
} from "@/lib/config/portal";
import type { ExerciseFrequency } from "@/lib/config/portal";
import {
  BIOLOGICAL_SEX_LABELS,
  BIOLOGICAL_SEX_VALUES,
  type BiologicalSex,
} from "@/lib/config/measurements";

type ProfileFields = {
  name: string;
  phone: string;
  dateOfBirth: string;
  biologicalSex: BiologicalSex | "";
  city: string;
  occupation: string;
  mainConcern: string;
  goals: string;
  diagnosisHistory: string;
  currentMedications: string;
  currentSupplements: string;
  sleepHoursAvg: number | "";
  exerciseFrequency: ExerciseFrequency | "";
  referralSource: string;
  notes: string;
};

type InitialProfile = {
  name?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  biologicalSex?: string | null;
  city?: string | null;
  occupation?: string | null;
  mainConcern?: string | null;
  goals?: string | null;
  diagnosisHistory?: string | null;
  currentMedications?: string | null;
  currentSupplements?: string | null;
  sleepHoursAvg?: number | null;
  exerciseFrequency?: string | null;
  referralSource?: string | null;
  notes?: string | null;
};

function fromInitial(init: InitialProfile): ProfileFields {
  return {
    name: init.name ?? "",
    phone: init.phone ?? "",
    dateOfBirth: init.dateOfBirth ?? "",
    biologicalSex: (init.biologicalSex as BiologicalSex | null) ?? "",
    city: init.city ?? "",
    occupation: init.occupation ?? "",
    mainConcern: init.mainConcern ?? "",
    goals: init.goals ?? "",
    diagnosisHistory: init.diagnosisHistory ?? "",
    currentMedications: init.currentMedications ?? "",
    currentSupplements: init.currentSupplements ?? "",
    sleepHoursAvg: init.sleepHoursAvg ?? "",
    exerciseFrequency: (init.exerciseFrequency as ExerciseFrequency | null) ?? "",
    referralSource: init.referralSource ?? "",
    notes: init.notes ?? "",
  };
}

export function AdminProfileEditForm({
  patientId,
  initial,
}: {
  patientId: string;
  initial: InitialProfile;
}) {
  const [form, setForm] = useState<ProfileFields>(() => fromInitial(initial));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function set(field: keyof ProfileFields) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/patients/${patientId}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          name: form.name.trim() || undefined,
          biologicalSex: form.biologicalSex === "" ? null : form.biologicalSex,
          sleepHoursAvg: form.sleepHoursAvg === "" ? null : Number(form.sleepHoursAvg),
          exerciseFrequency: form.exerciseFrequency === "" ? null : form.exerciseFrequency,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError("Failed to save — please try again.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), SAVED_FEEDBACK_MS);
    } catch {
      setError("Failed to save — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.formStack}>
      {/* Personal */}
      <p className={styles.sectionEyebrow}>Personal</p>
      <div className={styles.formGrid2}>
        <div>
          <label className={styles.assignLabel} htmlFor="ap-name">
            Full name
          </label>
          <input
            id="ap-name"
            className={styles.assignField}
            value={form.name}
            onChange={set("name")}
            maxLength={PROFILE_NAME_MAX_LENGTH}
          />
        </div>
        <div>
          <label className={styles.assignLabel} htmlFor="ap-dob">
            Date of birth
          </label>
          <input
            id="ap-dob"
            className={styles.assignField}
            type="date"
            value={form.dateOfBirth}
            onChange={set("dateOfBirth")}
            maxLength={PROFILE_DOB_MAX_LENGTH}
          />
        </div>
        <div>
          {/* Recorded for reference intervals only — ferritin, testosterone,
              haemoglobin and creatinine are read against different ranges, and
              a single range mislabels real patients. */}
          <label className={styles.assignLabel} htmlFor="ap-sex">
            Sex (for reference ranges)
          </label>
          <select
            id="ap-sex"
            className={styles.assignField}
            value={form.biologicalSex}
            onChange={set("biologicalSex")}
          >
            <option value="">Not recorded</option>
            {BIOLOGICAL_SEX_VALUES.map((v) => (
              <option key={v} value={v}>
                {BIOLOGICAL_SEX_LABELS[v]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={styles.assignLabel} htmlFor="ap-phone">
            Phone
          </label>
          <input
            id="ap-phone"
            className={styles.assignField}
            type="tel"
            value={form.phone}
            onChange={set("phone")}
            maxLength={PROFILE_PHONE_MAX_LENGTH}
            placeholder="+41 79 000 00 00"
          />
        </div>
        <div>
          <label className={styles.assignLabel} htmlFor="ap-city">
            City
          </label>
          <input
            id="ap-city"
            className={styles.assignField}
            value={form.city}
            onChange={set("city")}
            maxLength={PROFILE_CITY_MAX_LENGTH}
            placeholder="Zürich"
          />
        </div>
        <div>
          <label className={styles.assignLabel} htmlFor="ap-occupation">
            Occupation
          </label>
          <input
            id="ap-occupation"
            className={styles.assignField}
            value={form.occupation}
            onChange={set("occupation")}
            maxLength={PROFILE_OCCUPATION_MAX_LENGTH}
            placeholder="Founder, executive…"
          />
        </div>
        <div>
          <label className={styles.assignLabel} htmlFor="ap-referral">
            Referral source
          </label>
          <input
            id="ap-referral"
            className={styles.assignField}
            value={form.referralSource}
            onChange={set("referralSource")}
            maxLength={PROFILE_REFERRAL_SOURCE_MAX_LENGTH}
            placeholder="Referral, social media…"
          />
        </div>
      </div>

      {/* Clinical */}
      <p className={styles.sectionEyebrow}>Clinical</p>
      <div>
        <label className={styles.assignLabel} htmlFor="ap-concern">
          Main concern
        </label>
        <textarea
          id="ap-concern"
          className={styles.assignFieldTextarea}
          rows={2}
          value={form.mainConcern}
          onChange={set("mainConcern")}
          maxLength={PATIENT_NOTE_MAX_LENGTH}
        />
      </div>
      <div>
        <label className={styles.assignLabel} htmlFor="ap-goals">
          Goals
        </label>
        <textarea
          id="ap-goals"
          className={styles.assignFieldTextarea}
          rows={2}
          value={form.goals}
          onChange={set("goals")}
          maxLength={PATIENT_NOTE_MAX_LENGTH}
        />
      </div>
      <div>
        <label className={styles.assignLabel} htmlFor="ap-diagnosis">
          Diagnosis history
        </label>
        <textarea
          id="ap-diagnosis"
          className={styles.assignFieldTextarea}
          rows={2}
          value={form.diagnosisHistory}
          onChange={set("diagnosisHistory")}
          maxLength={PATIENT_NOTE_MAX_LENGTH}
        />
      </div>
      <div className={styles.formGrid2}>
        <div>
          <label className={styles.assignLabel} htmlFor="ap-meds">
            Current medications
          </label>
          <textarea
            id="ap-meds"
            className={styles.assignFieldTextarea}
            rows={2}
            value={form.currentMedications}
            onChange={set("currentMedications")}
            maxLength={PATIENT_NOTE_MAX_LENGTH}
          />
        </div>
        <div>
          <label className={styles.assignLabel} htmlFor="ap-supps">
            Current supplements
          </label>
          <textarea
            id="ap-supps"
            className={styles.assignFieldTextarea}
            rows={2}
            value={form.currentSupplements}
            onChange={set("currentSupplements")}
            maxLength={PATIENT_NOTE_MAX_LENGTH}
          />
        </div>
      </div>

      {/* Lifestyle */}
      <p className={styles.sectionEyebrow}>Lifestyle</p>
      <div className={styles.formGrid2}>
        <div>
          <label className={styles.assignLabel} htmlFor="ap-sleep">
            Avg sleep (hours/night)
          </label>
          <input
            id="ap-sleep"
            className={styles.assignField}
            type="number"
            min={SLEEP_HOURS_MIN}
            max={SLEEP_HOURS_MAX}
            value={form.sleepHoursAvg}
            onChange={set("sleepHoursAvg")}
            placeholder="7"
          />
        </div>
        <div>
          <label className={styles.assignLabel} htmlFor="ap-exercise">
            Exercise frequency
          </label>
          <select
            id="ap-exercise"
            className={styles.assignField}
            value={form.exerciseFrequency}
            onChange={set("exerciseFrequency")}
          >
            <option value="">Select…</option>
            {EXERCISE_FREQUENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Patient notes field */}
      <div>
        <label className={styles.assignLabel} htmlFor="ap-notes">
          Patient notes
        </label>
        <textarea
          id="ap-notes"
          className={styles.assignFieldTextarea}
          rows={3}
          value={form.notes}
          onChange={set("notes")}
          maxLength={PATIENT_NOTE_MAX_LENGTH}
          placeholder="Anything the patient shared outside of the portal…"
        />
      </div>

      {error && <p className={styles.assignError}>{error}</p>}
      <button type="submit" className={styles.assignSubmit} disabled={saving}>
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save profile"}
      </button>
    </form>
  );
}
