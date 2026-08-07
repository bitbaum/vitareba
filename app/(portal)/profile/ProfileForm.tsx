"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "../portal.module.css";
import profileStyles from "./profile.module.css";
import authStyles from "../../forms.module.css";
import {
  SAVED_FEEDBACK_MS,
  SAVING_LABEL,
  SAVED_LABEL,
  EXERCISE_FREQUENCY_OPTIONS,
  SLEEP_HOURS_MIN,
  SLEEP_HOURS_MAX,
  PATIENT_NOTE_MAX_LENGTH,
  PROFILE_NAME_MAX_LENGTH,
  PROFILE_PHONE_MAX_LENGTH,
  PROFILE_CITY_MAX_LENGTH,
  PROFILE_OCCUPATION_MAX_LENGTH,
  PROFILE_REFERRAL_SOURCE_MAX_LENGTH,
} from "@/lib/config/portal";
import type { ExerciseFrequency } from "@/lib/config/portal";
import { computeProfileCompleteness } from "@/lib/domain/profile";
import { COMPANY } from "@/lib/config/company";
import { formatDateLong } from "@/lib/utils/format";

type ProfileApiData = {
  // User fields (from users table — always fresh, never stale JWT)
  name: string | null;
  email: string | null;
  image: string | null;
  memberSince: string | null;
  // Profile fields (from profiles table)
  phone?: string | null;
  dateOfBirth?: string | null;
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
  digestOptOut?: boolean;
  reminderOptOut?: boolean;
};

type ProfileData = {
  name: string;
  phone: string;
  dateOfBirth: string;
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
  digestOptOut: boolean;
  reminderOptOut: boolean;
};

const EMPTY_FORM: ProfileData = {
  name: "",
  phone: "",
  dateOfBirth: "",
  city: "",
  occupation: "",
  mainConcern: "",
  goals: "",
  diagnosisHistory: "",
  currentMedications: "",
  currentSupplements: "",
  sleepHoursAvg: "",
  exerciseFrequency: "",
  referralSource: "",
  notes: "",
  digestOptOut: false,
  reminderOptOut: false,
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length > 0) return parts[0].slice(0, 2).toUpperCase();
  return "?";
}

function ProfileHero({
  apiData,
}: {
  apiData: ProfileApiData;
}) {
  const name = apiData.name;
  const email = apiData.email;
  const image = apiData.image;
  const occupation = apiData.occupation;
  const city = apiData.city;
  const memberSince = apiData.memberSince;

  const initials = name ? getInitials(name) : (email ? email[0].toUpperCase() : "?");
  const meta = [occupation, city].filter(Boolean).join(" · ");

  return (
    <div className={profileStyles.heroCard}>
      <div className={profileStyles.avatarWrap}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={name ?? "Avatar"} className={profileStyles.avatarImg} />
        ) : (
          <div className={profileStyles.avatarInitials}>
            {initials}
          </div>
        )}
      </div>
      <div className={profileStyles.heroInfo}>
        {name ? (
          <p className={profileStyles.heroName}>{name}</p>
        ) : (
          <p className={profileStyles.heroNamePlaceholder}>Add your name below</p>
        )}
        {email && <p className={profileStyles.heroEmail}>{email}</p>}
        {meta && <p className={profileStyles.heroMeta}>{meta}</p>}
        {memberSince && (
          <p className={profileStyles.heroSince}>
            Member since {formatDateLong(memberSince)}
          </p>
        )}
      </div>
    </div>
  );
}

export function ProfileForm() {
  const [apiData, setApiData] = useState<ProfileApiData | null>(null);
  const [form, setForm] = useState<ProfileData>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      if (!res.ok) { setLoadError(true); setLoading(false); return; }
      const json = await res.json();
      const data: ProfileApiData = json.data ?? {};
      setApiData(data);
      setForm({
        name: data.name ?? "",
        phone: data.phone ?? "",
        dateOfBirth: data.dateOfBirth ?? "",
        city: data.city ?? "",
        occupation: data.occupation ?? "",
        mainConcern: data.mainConcern ?? "",
        goals: data.goals ?? "",
        diagnosisHistory: data.diagnosisHistory ?? "",
        currentMedications: data.currentMedications ?? "",
        currentSupplements: data.currentSupplements ?? "",
        sleepHoursAvg: data.sleepHoursAvg ?? "",
        exerciseFrequency: (data.exerciseFrequency as ExerciseFrequency | null) ?? "",
        referralSource: data.referralSource ?? "",
        notes: data.notes ?? "",
        digestOptOut: data.digestOptOut ?? false,
        reminderOptOut: data.reminderOptOut ?? false,
      });
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          // Don't send empty name — Zod requires min(1) and we shouldn't clear an existing name accidentally
          name: form.name.trim() || undefined,
          sleepHoursAvg: form.sleepHoursAvg === "" ? null : Number(form.sleepHoursAvg),
          exerciseFrequency: form.exerciseFrequency === "" ? null : form.exerciseFrequency,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setSaveError("Failed to save changes. Please try again.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), SAVED_FEEDBACK_MS);
      // Reload from DB so the hero card reflects the updated name/city immediately
      load();
    } catch {
      setSaveError("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function set(field: keyof ProfileData) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  if (loading) return <div className={styles.emptyState}>Loading…</div>;
  if (loadError) return <div className={styles.emptyState}>Failed to load your profile. Please refresh the page.</div>;

  const pct = computeProfileCompleteness(form as Record<string, unknown>);

  return (
    <>
      {/* ── Profile hero ──────────────────────────────────────────────── */}
      {apiData && <ProfileHero apiData={{ ...apiData, name: form.name || apiData.name, occupation: form.occupation, city: form.city }} />}

      {/* ── Completeness indicator ────────────────────────────────────── */}
      <div className={profileStyles.completenessCard}>
        <div className={profileStyles.completenessHeader}>
          <span className={profileStyles.completenessLabel}>Profile completeness</span>
          <span className={profileStyles.completenessValue}>{pct}%</span>
        </div>
        <div className={profileStyles.progressTrack}>
          <div className={profileStyles.progressFill} style={{ width: `${pct}%` }} />
        </div>
        {pct < 100 && (
          <p className={profileStyles.completenessHint}>
            A complete profile helps {COMPANY.clinicianName} personalise your programme and provide
            24/7 tailored support.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className={profileStyles.form}>

        {/* ── Personal ──────────────────────────────────────────────── */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Personal</p>
          <div className={profileStyles.fieldGrid}>
            <div className={authStyles.field}>
              <label className={authStyles.label} htmlFor="name">Full name</label>
              <input id="name" className={authStyles.input} value={form.name} onChange={set("name")} maxLength={PROFILE_NAME_MAX_LENGTH} />
            </div>
            <div className={authStyles.field}>
              <label className={authStyles.label} htmlFor="dob">Date of birth</label>
              <input id="dob" className={authStyles.input} type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} />
            </div>
            <div className={authStyles.field}>
              <label className={authStyles.label} htmlFor="phone">Phone</label>
              <input id="phone" className={authStyles.input} type="tel" value={form.phone} onChange={set("phone")} maxLength={PROFILE_PHONE_MAX_LENGTH} placeholder="+41 79 000 00 00" />
            </div>
            <div className={authStyles.field}>
              <label className={authStyles.label} htmlFor="city">City</label>
              <input id="city" className={authStyles.input} value={form.city} onChange={set("city")} maxLength={PROFILE_CITY_MAX_LENGTH} placeholder="Zürich" />
            </div>
            <div className={authStyles.field}>
              <label className={authStyles.label} htmlFor="occupation">Occupation</label>
              <input id="occupation" className={authStyles.input} value={form.occupation} onChange={set("occupation")} maxLength={PROFILE_OCCUPATION_MAX_LENGTH} placeholder="Founder, engineer, executive…" />
            </div>
          </div>
        </div>

        {/* ── Clinical context ──────────────────────────────────────── */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Clinical context</p>
          <div className={profileStyles.fieldStack}>
            <div className={authStyles.field}>
              <label className={authStyles.label} htmlFor="concern">Main concern</label>
              <textarea id="concern" className={profileStyles.textarea} value={form.mainConcern} onChange={set("mainConcern")} maxLength={PATIENT_NOTE_MAX_LENGTH} placeholder={`What brings you to ${COMPANY.shortName}?`} />
            </div>
            <div className={authStyles.field}>
              <label className={authStyles.label} htmlFor="goals">Goals</label>
              <textarea id="goals" className={profileStyles.textarea} value={form.goals} onChange={set("goals")} maxLength={PATIENT_NOTE_MAX_LENGTH} placeholder="What would success look like in 6 months?" />
            </div>
            <div className={authStyles.field}>
              <label className={authStyles.label} htmlFor="diagnosis">Diagnosis history</label>
              <textarea id="diagnosis" className={profileStyles.textarea} value={form.diagnosisHistory} onChange={set("diagnosisHistory")} maxLength={PATIENT_NOTE_MAX_LENGTH} placeholder="Any prior diagnoses (ADHD, anxiety, depression, etc.)" />
            </div>
            <div className={authStyles.field}>
              <label className={authStyles.label} htmlFor="meds">Current medications</label>
              <textarea id="meds" className={profileStyles.textarea} value={form.currentMedications} onChange={set("currentMedications")} maxLength={PATIENT_NOTE_MAX_LENGTH} placeholder="Name, dose, frequency — or 'none'" />
            </div>
            <div className={authStyles.field}>
              <label className={authStyles.label} htmlFor="supps">Current supplements</label>
              <textarea id="supps" className={profileStyles.textarea} value={form.currentSupplements} onChange={set("currentSupplements")} maxLength={PATIENT_NOTE_MAX_LENGTH} placeholder="Omega-3, magnesium, creatine…" />
            </div>
          </div>
        </div>

        {/* ── Lifestyle baseline ────────────────────────────────────── */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Lifestyle baseline</p>
          <div className={profileStyles.fieldGrid}>
            <div className={authStyles.field}>
              <label className={authStyles.label} htmlFor="sleep">Average sleep (hours/night)</label>
              <input
                id="sleep"
                className={authStyles.input}
                type="number"
                min={SLEEP_HOURS_MIN}
                max={SLEEP_HOURS_MAX}
                value={form.sleepHoursAvg}
                onChange={set("sleepHoursAvg")}
                placeholder="7"
              />
            </div>
            <div className={authStyles.field}>
              <label className={authStyles.label} htmlFor="exercise">Exercise frequency</label>
              <select id="exercise" className={authStyles.input} value={form.exerciseFrequency} onChange={set("exerciseFrequency")}>
                <option value="">Select…</option>
                {EXERCISE_FREQUENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Notes ────────────────────────────────────────────────── */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Notes for {COMPANY.clinicianName}</p>
          <div className={authStyles.field}>
            <textarea
              id="notes"
              aria-label={`Notes for ${COMPANY.clinicianName}`}
              className={profileStyles.textareaLg}
              value={form.notes}
              onChange={set("notes")}
              maxLength={PATIENT_NOTE_MAX_LENGTH}
              placeholder={`Anything else you'd like ${COMPANY.clinicianName} to know before your first consultation…`}
            />
          </div>
        </div>

        {/* ── How did you hear ─────────────────────────────────────── */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>How did you find {COMPANY.shortName}?</p>
          <div className={authStyles.field}>
            <input id="referral" aria-label={`How did you find ${COMPANY.shortName}?`} className={authStyles.input} value={form.referralSource} onChange={set("referralSource")} maxLength={PROFILE_REFERRAL_SOURCE_MAX_LENGTH} placeholder="Referral, social media, search…" />
          </div>
        </div>

        {/* ── Email preferences ─────────────────────────────────────── */}
        <div className={styles.card} id="email-preferences">
          <p className={styles.cardTitle}>Email preferences</p>
          <label className={profileStyles.checkboxRow}>
            <input
              type="checkbox"
              className={profileStyles.checkboxInput}
              checked={form.digestOptOut}
              onChange={(e) => setForm((prev) => ({ ...prev, digestOptOut: e.target.checked }))}
            />
            Opt out of weekly summary emails
          </label>
          <p className={profileStyles.checkboxHint}>
            Weekly summaries include your check-in averages, latest score, and booking status. Uncheck to receive them.
          </p>
          <label className={profileStyles.checkboxRow}>
            <input
              type="checkbox"
              className={profileStyles.checkboxInput}
              checked={form.reminderOptOut}
              onChange={(e) => setForm((prev) => ({ ...prev, reminderOptOut: e.target.checked }))}
            />
            Opt out of daily check-in reminder emails
          </label>
          <p className={profileStyles.checkboxHint}>
            Reminders are sent on days you haven&apos;t logged a check-in yet. Uncheck to receive them.
          </p>
        </div>

        {saveError && <p className={styles.formError}>{saveError}</p>}
        <button type="submit" className={authStyles.submit} disabled={saving}>
          {saving ? SAVING_LABEL : saved ? SAVED_LABEL : "Save changes"}
        </button>
      </form>
    </>
  );
}
