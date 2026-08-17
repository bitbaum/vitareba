"use client";

import { useCallback, useEffect, useState } from "react";
import shared from "@/app/shared.module.css";
import styles from "@/app/(admin)/admin.module.css";
import forms from "@/app/forms.module.css";
import { LoadingState } from "@/components/LoadingState";
import { WeeklyHoursEditor } from "./WeeklyHoursEditor";
import type { WeeklyHours } from "@/lib/config/scheduling";
import {
  CLINICIAN_BIO_MAX_LENGTH,
  CLINICIAN_TITLE_MAX_LENGTH,
  CLINICIAN_SPECIALTY_MAX_LENGTH,
  CLINICIAN_SPECIALTIES_MAX_COUNT,
} from "@/lib/config/portal";

type ProfileData = {
  bio: string | null;
  title: string | null;
  specialties: string[];
  weeklyHours: WeeklyHours;
  slotMinutes: number;
  bufferMinutes: number;
  leadTimeHours: number;
  horizonDays: number;
  maxPerDay: number;
  usingDefaults: boolean;
};

/**
 * A clinician's own bio, specialties and working hours — the settings that
 * used to be a hardcoded per-email object in source (lib/config/scheduling.ts)
 * that only a developer could change, one of them explicitly a placeholder
 * ("evenings-and-Friday product-testing window"). Every patient booking
 * against those hours was offered fake times. This form is what replaced it.
 */
export function ClinicianSettingsForm() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [specialtyDraft, setSpecialtyDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch("/api/clinician/profile");
      if (!res.ok) { setLoadError(true); return; }
      const body = await res.json();
      setData(body.data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function addSpecialty() {
    const value = specialtyDraft.trim();
    if (!data || !value) return;
    if (data.specialties.length >= CLINICIAN_SPECIALTIES_MAX_COUNT) return;
    if (data.specialties.includes(value)) { setSpecialtyDraft(""); return; }
    setData({ ...data, specialties: [...data.specialties, value.slice(0, CLINICIAN_SPECIALTY_MAX_LENGTH)] });
    setSpecialtyDraft("");
  }

  function removeSpecialty(value: string) {
    if (!data) return;
    setData({ ...data, specialties: data.specialties.filter((s) => s !== value) });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/clinician/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bio: data.bio,
          title: data.title,
          specialties: data.specialties,
          weeklyHours: data.weeklyHours,
          slotMinutes: data.slotMinutes,
          bufferMinutes: data.bufferMinutes,
          leadTimeHours: data.leadTimeHours,
          horizonDays: data.horizonDays,
          maxPerDay: data.maxPerDay,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        setSaveError(body?.error ?? "Failed to save. Please try again.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await load();
    } catch {
      setSaveError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;
  if (loadError || !data) {
    return (
      <div className={styles.emptyState}>
        Could not load your settings.{" "}
        <button type="button" onClick={load} className={shared.btnText}>Retry</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={shared.formStack}>
      <div className={styles.cardMb}>
        <p className={styles.cardTitle}>Who patients see</p>
        {data.usingDefaults && (
          <p className={shared.formHint}>
            You haven&apos;t set a bio yet — patients viewing your Care Team profile see your name only, until you save one here.
          </p>
        )}
        <div className={forms.field}>
          <label className={forms.label} htmlFor="title">Title</label>
          <input
            id="title"
            className={forms.input}
            value={data.title ?? ""}
            onChange={(e) => setData({ ...data, title: e.target.value || null })}
            maxLength={CLINICIAN_TITLE_MAX_LENGTH}
            placeholder="MD, General Practitioner"
          />
        </div>
        <div className={forms.field}>
          <label className={forms.label} htmlFor="bio">Bio</label>
          <textarea
            id="bio"
            className={shared.formTextareaLg}
            value={data.bio ?? ""}
            onChange={(e) => setData({ ...data, bio: e.target.value || null })}
            maxLength={CLINICIAN_BIO_MAX_LENGTH}
            placeholder="What patients should know about you before their first consultation…"
          />
        </div>
        <div className={forms.field}>
          <label className={forms.label} htmlFor="specialty-draft">Specialties</label>
          <div className="tags">
            {data.specialties.map((s) => (
              <span key={s} className="tag">
                {s}{" "}
                <button type="button" onClick={() => removeSpecialty(s)} aria-label={`Remove ${s}`} className={shared.btnText}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className={styles.inlineRow}>
            <input
              id="specialty-draft"
              className={forms.input}
              value={specialtyDraft}
              onChange={(e) => setSpecialtyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addSpecialty(); }
              }}
              maxLength={CLINICIAN_SPECIALTY_MAX_LENGTH}
              placeholder="ADHD, metabolic psychiatry…"
              disabled={data.specialties.length >= CLINICIAN_SPECIALTIES_MAX_COUNT}
            />
            <button type="button" className={shared.btnSecondary} onClick={addSpecialty}>Add</button>
          </div>
        </div>
      </div>

      <div className={styles.cardMb}>
        <p className={styles.cardTitle}>Working hours</p>
        {data.usingDefaults && (
          <p className={shared.formHint}>
            You&apos;re currently using the clinic&apos;s default hours. Set your real hours below — this is what patients are actually offered.
          </p>
        )}
        <WeeklyHoursEditor value={data.weeklyHours} onChange={(weeklyHours) => setData({ ...data, weeklyHours })} />
      </div>

      <div className={styles.cardMb}>
        <p className={styles.cardTitle}>Booking rules</p>
        <div className={styles.hoursGrid}>
          <div className={forms.field}>
            <label className={forms.label} htmlFor="slotMinutes">Appointment length (minutes)</label>
            <input id="slotMinutes" type="number" min={5} max={240} className={forms.input}
              value={data.slotMinutes} onChange={(e) => setData({ ...data, slotMinutes: Number(e.target.value) })} />
          </div>
          <div className={forms.field}>
            <label className={forms.label} htmlFor="bufferMinutes">Buffer after each appointment (minutes)</label>
            <input id="bufferMinutes" type="number" min={0} max={120} className={forms.input}
              value={data.bufferMinutes} onChange={(e) => setData({ ...data, bufferMinutes: Number(e.target.value) })} />
          </div>
          <div className={forms.field}>
            <label className={forms.label} htmlFor="leadTimeHours">Earliest bookable slot (hours from now)</label>
            <input id="leadTimeHours" type="number" min={0} max={720} className={forms.input}
              value={data.leadTimeHours} onChange={(e) => setData({ ...data, leadTimeHours: Number(e.target.value) })} />
          </div>
          <div className={forms.field}>
            <label className={forms.label} htmlFor="horizonDays">How far ahead patients can book (days)</label>
            <input id="horizonDays" type="number" min={1} max={180} className={forms.input}
              value={data.horizonDays} onChange={(e) => setData({ ...data, horizonDays: Number(e.target.value) })} />
          </div>
          <div className={forms.field}>
            <label className={forms.label} htmlFor="maxPerDay">Maximum appointments per day</label>
            <input id="maxPerDay" type="number" min={1} max={48} className={forms.input}
              value={data.maxPerDay} onChange={(e) => setData({ ...data, maxPerDay: Number(e.target.value) })} />
          </div>
        </div>
      </div>

      {saveError && <p className={shared.formError}>{saveError}</p>}
      <button type="submit" className={`${shared.btnPrimary} ${shared.btnBlock}`} disabled={saving}>
        {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
      </button>
    </form>
  );
}
