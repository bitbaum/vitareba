"use client";

import { useCallback, useEffect, useState } from "react";
import shared from "@/app/shared.module.css";
import styles from "@/app/(admin)/admin.module.css";
import { LoadingState } from "@/components/LoadingState";
import { formatDateLong } from "@/lib/utils/format";

type ClinicianRow = {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
};

/**
 * Add or remove clinician status directly, by email — there is no public
 * "apply" flow any more. The owner adds someone they already know, the same
 * way they'd hand a new hire an office key.
 */
export function ClinicianManager() {
  const [rows, setRows] = useState<ClinicianRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch("/api/admin/clinicians");
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const body = await res.json();
      setRows(body.data ?? []);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/clinicians", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        setError(body?.error ?? "Could not add that clinician.");
        return;
      }
      setEmail("");
      await load();
    } catch {
      setError("Could not add that clinician.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    try {
      const res = await fetch(`/api/admin/clinicians/${id}`, { method: "DELETE" });
      if (res.ok) await load();
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div>
      <div className={styles.cardMb}>
        <p className={styles.cardLabel}>Add a clinician</p>
        <form onSubmit={handleAdd} className={shared.formStack}>
          <div className={styles.formField}>
            <input
              type="email"
              className={styles.formInput}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="their.email@example.com"
              required
            />
          </div>
          {error && <p className={shared.formError}>{error}</p>}
          <div className={styles.formActions}>
            <button type="submit" className={shared.btnPrimary} disabled={submitting}>
              {submitting ? "Adding…" : "Add clinician"}
            </button>
          </div>
        </form>
      </div>

      {rows === null && !loadError && <LoadingState />}
      {loadError && (
        <div className={styles.emptyState}>
          Could not load clinicians.{" "}
          <button type="button" onClick={load} className={shared.btnText}>
            Retry
          </button>
        </div>
      )}
      {rows !== null && rows.length === 0 && (
        <div className={styles.card}>
          <div className={styles.emptyState}>No clinicians yet.</div>
        </div>
      )}
      {rows !== null && rows.length > 0 && (
        <div className={shared.listStack}>
          {rows.map((c) => (
            <div key={c.id} className={styles.cardMb}>
              <div className={styles.rowBetween}>
                <div>
                  <p className={styles.cardTitle}>{c.name ?? c.email}</p>
                  <p className={shared.metaSm}>
                    {c.email} · joined {formatDateLong(c.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  className={shared.btnSecondary}
                  onClick={() => handleRemove(c.id)}
                  disabled={removingId === c.id}
                >
                  {removingId === c.id ? "…" : "Remove"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
