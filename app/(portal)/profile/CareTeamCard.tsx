"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../portal.module.css";

type Clinician = { id: string; name: string | null };

/**
 * The patient chooses who treats them. Previously only an admin could create
 * a care-team link, so a new patient had no way to say "this is my doctor" —
 * and everything keyed off the care team (booking default, message recipient,
 * document notifications) had nothing to work with.
 */
export function CareTeamCard({ selfId }: { selfId: string }) {
  const router = useRouter();
  const [clinicians, setClinicians] = useState<Clinician[]>([]);
  const [mine, setMine] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/care-team");
      if (!res.ok) { setError("Could not load the clinician list."); return; }
      const { data } = await res.json();
      setClinicians(data?.clinicians ?? []);
      setMine(data?.mine ?? []);
    } catch {
      setError("Could not load the clinician list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle(clinicianId: string, isMine: boolean) {
    setBusyId(clinicianId);
    setError("");
    try {
      const res = await fetch("/api/care-team", {
        method: isMine ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicianId }),
      });
      if (!res.ok) { setError("That didn't save — please try again."); return; }
      setMine((prev) => (isMine ? prev.filter((id) => id !== clinicianId) : [...prev, clinicianId]));
      // Booking defaults and message recipients read the care team server-side.
      router.refresh();
    } catch {
      setError("That didn't save — please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return null;
  if (clinicians.length === 0) return null;

  return (
    <div className={`${styles.card} ${styles.cardGap}`}>
      <p className={styles.cardTitle}>My care team</p>
      <p className={styles.formHint}>
        Choosing a clinician sets who your appointments, messages and uploaded
        documents go to. You can pick more than one, and change it any time.
      </p>

      <div className={styles.listStack}>
        {clinicians.map((c) => {
          const isMine = mine.includes(c.id);
          return (
            <div key={c.id} className={styles.docRow}>
              <div>
                <p className={styles.docTitle}>
                  {c.name ?? "Clinician"}
                  {c.id === selfId && " (you)"}
                </p>
                <p className={styles.meta}>
                  {isMine ? "On your care team" : "Not on your care team"}
                </p>
              </div>
              <button
                type="button"
                className={isMine ? styles.cancelBtn : styles.btnSecondary}
                onClick={() => toggle(c.id, isMine)}
                disabled={busyId === c.id}
              >
                {busyId === c.id ? "Saving…" : isMine ? "Remove" : "Choose"}
              </button>
            </div>
          );
        })}
      </div>

      {error && <p className={styles.formError}>{error}</p>}
    </div>
  );
}
