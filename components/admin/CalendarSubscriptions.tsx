"use client";

/**
 * Subscribing a clinician's real calendar so it blocks slots here.
 *
 * The instructions matter as much as the form. "Paste your calendar's secret
 * address" is meaningless to most people and different in every app, so the
 * exact menu path for each is written out — a feature nobody can find the input
 * for is a feature that does not exist.
 *
 * The URL is write-only. Once saved it comes back as a masked hint, because it
 * is a credential that grants read access to someone's entire life, and there is
 * no reason for it to be sitting in a page that might be screenshared.
 */

import { useCallback, useEffect, useState } from "react";
import styles from "@/app/(admin)/admin.module.css";
import shared from "@/app/shared.module.css";
import forms from "@/app/forms.module.css";
import { LoadingState } from "@/components/LoadingState";
import { CALENDAR_LABEL_MAX, CALENDAR_REFRESH_MINUTES } from "@/lib/config/calendar-sync";
import { formatDateTime } from "@/lib/utils/format";

type CalendarRow = {
  id: string;
  label: string;
  urlHint: string;
  active: boolean;
  lastFetchedAt: string | null;
  lastError: string | null;
  lastEventCount: number | null;
};

/** Where each calendar app hides the private feed. Wrong path = wrong link = no sync. */
const WHERE_TO_FIND_IT = [
  {
    app: "Google Calendar",
    path: "Settings → your calendar → Integrate calendar → Secret address in iCal format",
  },
  {
    app: "Apple / iCloud",
    path: "calendar.icloud.com → share the calendar → Public Calendar → copy the webcal:// link",
  },
  {
    app: "Outlook / Microsoft 365",
    path: "Settings → Calendar → Shared calendars → Publish a calendar → ICS link",
  },
];

export function CalendarSubscriptions({ clinicianId }: { clinicianId?: string }) {
  const [rows, setRows] = useState<CalendarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [label, setLabel] = useState("");
  const [icsUrl, setIcsUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const query = clinicianId ? `?clinicianId=${encodeURIComponent(clinicianId)}` : "";

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/calendars${query}`);
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const body = await res.json();
      setRows(body.data ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const res = await fetch("/api/calendars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, icsUrl, clinicianId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Could not add that calendar.");
        return;
      }
      setLabel("");
      setIcsUrl("");
      // Say what actually happened. "Saved" while the first read silently failed
      // is how a clinician ends up double-booked believing they are protected.
      setNotice(
        body?.data?.synced
          ? `Connected — ${body.data.intervals} busy period${body.data.intervals === 1 ? "" : "s"} are now blocking slots.`
          : `Saved, but the first read failed: ${body?.data?.error ?? "unknown reason"}`
      );
      await load();
    } catch {
      setError("Could not add that calendar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/calendars?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Could not remove that calendar.");
        return;
      }
      await load();
    } catch {
      setError("Could not remove that calendar.");
    }
  }

  if (loading) return <LoadingState lines={2} />;
  if (loadError) return <p className={shared.formError}>Could not load calendars.</p>;

  return (
    <div>
      <p className={shared.formHint}>
        Point this at a calendar you already keep, and anything in it stops patients being
        offered that time. It is read-only — nothing here can change your calendar — and it
        refreshes about every {CALENDAR_REFRESH_MINUTES} minutes. Only the times are stored:
        never the titles, guests or notes.
      </p>

      {rows.length > 0 && (
        <div className={shared.listStack}>
          {rows.map((r) => (
            <div key={r.id} className={shared.docRow}>
              <div>
                <div className={shared.docTitle}>{r.label}</div>
                <div className={shared.docMeta}>
                  {r.urlHint}
                  {r.lastFetchedAt ? ` · read ${formatDateTime(r.lastFetchedAt)}` : " · never read"}
                  {r.lastEventCount !== null ? ` · ${r.lastEventCount} busy periods` : ""}
                </div>
                {/* A broken feed must be loud. A calendar that stopped working
                    quietly is a clinician being offered during their own
                    meetings, and looks identical to having no calendar at all. */}
                {r.lastError && <div className={shared.formError}>{r.lastError}</div>}
              </div>
              <button type="button" className={shared.btnText} onClick={() => handleRemove(r.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className={shared.formStack}>
        <div className={forms.field}>
          <label className={forms.label} htmlFor="cal-label">
            What is this calendar?
          </label>
          <input
            id="cal-label"
            className={forms.input}
            value={label}
            maxLength={CALENDAR_LABEL_MAX}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Personal, Hospital rota…"
            required
          />
        </div>
        <div className={forms.field}>
          <label className={forms.label} htmlFor="cal-url">
            Secret address in iCal format
          </label>
          <input
            id="cal-url"
            className={forms.input}
            value={icsUrl}
            onChange={(e) => setIcsUrl(e.target.value)}
            placeholder="https://… or webcal://…"
            required
          />
          <p className={shared.formHint}>
            {/* Say what is true. It is NOT encrypted at rest, and telling a
                clinician it is would be a security claim we cannot keep. */}
            Treat this like a password — anyone holding it can read the whole calendar. After
            you save it, it is never sent back to the browser and never shown again; it leaves
            the database only to fetch your free/busy times.
          </p>
        </div>

        {error && <p className={shared.formError}>{error}</p>}
        {notice && <p className={shared.formHint}>{notice}</p>}

        <div className={shared.formActions}>
          <button type="submit" className={shared.btnPrimary} disabled={saving}>
            {saving ? "Connecting…" : "Connect calendar"}
          </button>
        </div>
      </form>

      <p className={styles.sectionLabel}>Where to find it</p>
      {WHERE_TO_FIND_IT.map((w) => (
        <p key={w.app} className={shared.docMeta}>
          <strong>{w.app}:</strong> {w.path}
        </p>
      ))}
    </div>
  );
}
