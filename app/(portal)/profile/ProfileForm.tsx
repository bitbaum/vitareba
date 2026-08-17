"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "../portal.module.css";
import profileStyles from "./profile.module.css";
import authStyles from "../../forms.module.css";
import {
  SAVED_FEEDBACK_MS,
  SAVING_LABEL,
  SAVED_LABEL,
  PATIENT_NOTE_MAX_LENGTH,
  PROFILE_REFERRAL_SOURCE_MAX_LENGTH,
} from "@/lib/config/portal";
import type { ExerciseFrequency } from "@/lib/config/portal";
import type { BiologicalSex } from "@/lib/config/measurements";
import { computeProfileCompleteness } from "@/lib/domain/profile";
import { COMPANY } from "@/lib/config/company";
import { formatDateLong } from "@/lib/utils/format";
import { LoadingState } from "@/components/LoadingState";
import type { ProfileData } from "./profile-types";
import { PersonalFields } from "./PersonalFields";
import { ClinicalContextFields } from "./ClinicalContextFields";
import { LifestyleFields } from "./LifestyleFields";
import { EmailPreferencesFields } from "./EmailPreferencesFields";

type ProfileApiData = {
  // User fields (from users table — always fresh, never stale JWT)
  name: string | null;
  email: string | null;
  image: string | null;
  memberSince: string | null;
  // Profile fields (from profiles table)
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
  digestOptOut?: boolean;
  reminderOptOut?: boolean;
};

const EMPTY_FORM: ProfileData = {
  name: "",
  phone: "",
  dateOfBirth: "",
  biologicalSex: "",
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

export function ProfileForm({ clinician = COMPANY.clinicianFallback }: { clinician?: string }) {
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
        biologicalSex: (data.biologicalSex as BiologicalSex | null) ?? "",
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
          biologicalSex: form.biologicalSex === "" ? null : form.biologicalSex,
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

  if (loading) return <LoadingState />;
  if (loadError) return <div className={styles.emptyState}>Failed to load your profile. Please refresh the page.</div>;

  const pct = computeProfileCompleteness(form as Record<string, unknown>);

  return (
    <>
      {/* ── Profile hero ──────────────────────────────────────────────── */}
      {apiData && <ProfileHero apiData={{ ...apiData, name: form.name || apiData.name, occupation: form.occupation, city: form.city }} />}

      {/* ── Completeness indicator ────────────────────────────────────── */}
      <div className={styles.cardTight}>
        <div className={profileStyles.completenessHeader}>
          <span className={profileStyles.completenessLabel}>Profile completeness</span>
          <span className={`${styles.statValue} ${styles.statMd} ${profileStyles.completenessValue}`}>{pct}%</span>
        </div>
        <div className={profileStyles.completenessTrack}>
          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>
        {pct < 100 && (
          <p className={profileStyles.completenessHint}>
            A complete profile helps {clinician} personalise your programme and provide
            24/7 tailored support.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className={profileStyles.form}>

        <PersonalFields form={form} set={set} />
        <ClinicalContextFields form={form} set={set} />
        <LifestyleFields form={form} set={set} />

        {/* ── Notes ────────────────────────────────────────────────── */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Notes for {clinician}</p>
          <div className={authStyles.field}>
            <textarea
              id="notes"
              aria-label={`Notes for ${clinician}`}
              className={styles.formTextareaLg}
              value={form.notes}
              onChange={set("notes")}
              maxLength={PATIENT_NOTE_MAX_LENGTH}
              placeholder={`Anything else you'd like ${clinician} to know before your first consultation…`}
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

        <EmailPreferencesFields
          digestOptOut={form.digestOptOut}
          onDigestOptOutChange={(checked) => setForm((prev) => ({ ...prev, digestOptOut: checked }))}
          reminderOptOut={form.reminderOptOut}
          onReminderOptOutChange={(checked) => setForm((prev) => ({ ...prev, reminderOptOut: checked }))}
        />

        {saveError && <p className={styles.formError}>{saveError}</p>}
        <button type="submit" className={`${styles.btnPrimary} ${styles.btnBlock}`} disabled={saving}>
          {saving ? SAVING_LABEL : saved ? SAVED_LABEL : "Save changes"}
        </button>
      </form>
    </>
  );
}
