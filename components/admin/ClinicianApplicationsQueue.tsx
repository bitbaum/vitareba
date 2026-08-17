"use client";

import { useCallback, useEffect, useState } from "react";
import shared from "@/app/shared.module.css";
import styles from "@/app/(admin)/admin.module.css";
import { LoadingState } from "@/components/LoadingState";
import { formatDateLong } from "@/lib/utils/format";
import { CLINICIAN_APPLICATION_REVIEW_NOTE_MAX_LENGTH } from "@/lib/config/portal";

type ApplicationRow = {
  id: string;
  status: "pending" | "approved" | "declined";
  message: string;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  user: { id: string; name: string | null; email: string; createdAt: string };
};

const FILTERS = ["pending", "all", "approved", "declined"] as const;
type Filter = (typeof FILTERS)[number];

export function ClinicianApplicationsQueue() {
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<Filter>("pending");
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [declineNoteFor, setDeclineNoteFor] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch("/api/admin/clinician-applications");
      if (!res.ok) { setLoadError(true); return; }
      const body = await res.json();
      setRows(body.data ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(id: string, decision: "approve" | "decline", note?: string) {
    setDecidingId(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/clinician-applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        setError(body?.error ?? "Could not save that decision.");
        return;
      }
      setDeclineNoteFor(null);
      setDeclineNote("");
      await load();
    } catch {
      setError("Could not save that decision.");
    } finally {
      setDecidingId(null);
    }
  }

  if (loading) return <LoadingState />;
  if (loadError) {
    return (
      <div className={styles.emptyState}>
        Could not load applications.{" "}
        <button type="button" onClick={load} className={shared.btnText}>Retry</button>
      </div>
    );
  }

  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <div>
      <div className={styles.filterBar}>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`${styles.filterTab}${filter === f ? ` ${styles.filterTabActive}` : ""}`}
          >
            {f}{f === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
          </button>
        ))}
      </div>

      {error && <p className={styles.formErrorMb}>{error}</p>}

      {filtered.length === 0 ? (
        <div className={styles.card}>
          <div className={styles.emptyState}>No {filter === "all" ? "" : filter} applications.</div>
        </div>
      ) : (
        <div className={shared.listStack}>
          {filtered.map((app) => (
            <div key={app.id} className={styles.cardMb}>
              <div className={styles.rowBetween}>
                <div>
                  <p className={styles.cardTitle}>{app.user.name ?? app.user.email}</p>
                  <p className={shared.metaSm}>
                    {app.user.email} · applied {formatDateLong(app.createdAt)}
                  </p>
                </div>
                <span className={
                  app.status === "approved"
                    ? shared.pillTeal
                    : app.status === "pending"
                      ? shared.pillGold
                      : `${shared.pill} booking-status-cancelled`
                }>
                  {app.status}
                </span>
              </div>
              <p className={shared.formHint}>{app.message}</p>
              {app.reviewNote && (
                <p className={shared.metaSm}>Reviewer note: {app.reviewNote}</p>
              )}

              {app.status === "pending" && (
                <div className={styles.inlineRow}>
                  <button
                    type="button"
                    className={shared.btnPrimary}
                    onClick={() => decide(app.id, "approve")}
                    disabled={decidingId === app.id}
                  >
                    Approve
                  </button>
                  {declineNoteFor === app.id ? (
                    <>
                      <input
                        className={`${styles.hoursTimeInput} ${styles.declineNoteInput}`}
                        value={declineNote}
                        onChange={(e) => setDeclineNote(e.target.value)}
                        maxLength={CLINICIAN_APPLICATION_REVIEW_NOTE_MAX_LENGTH}
                        placeholder="Optional reason, shown to the applicant"
                      />
                      <button
                        type="button"
                        className={shared.btnSecondary}
                        onClick={() => decide(app.id, "decline", declineNote || undefined)}
                        disabled={decidingId === app.id}
                      >
                        Confirm decline
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={shared.btnSecondary}
                      onClick={() => { setDeclineNoteFor(app.id); setDeclineNote(""); }}
                      disabled={decidingId === app.id}
                    >
                      Decline
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
