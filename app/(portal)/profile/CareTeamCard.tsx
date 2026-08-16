"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../portal.module.css";
import cardStyles from "./profile.module.css";

type Clinician = { id: string; name: string | null; acceptingPatients: boolean };

/** Two-letter monogram — same idiom as the booking picker's clinician avatar. */
function initials(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The patient chooses who treats them. Previously only an admin could create
 * a care-team link, so a new patient had no way to say "this is my doctor" —
 * and everything keyed off the care team (booking default, message recipient,
 * document notifications) had nothing to work with.
 *
 * A clinician who has closed intake is never hidden — an existing patient must
 * still be able to find their own doctor in this list — but a NEW choice of
 * them is refused, server-side, with the same rule the booking flow enforces
 * (lib/domain/care-team.ts canPatientChooseClinician). The button here reflects
 * that rather than deciding it: the server is the one place this is true.
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
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "That didn't save — please try again.");
        return;
      }
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

      <div className={cardStyles.clinicianRow}>
        {clinicians.map((c) => {
          const isMine = mine.includes(c.id);
          const isSelf = c.id === selfId;
          // Closed intake only stops a NEW choice — an existing member keeps
          // full access to Remove, exactly as before this feature existed.
          // A dual-role clinician can ALWAYS choose themselves regardless of
          // their own intake setting (canPatientChooseClinician's self-rule) —
          // caught live: without this, George's own card showed "not
          // accepting" against himself the moment he closed his own intake,
          // even though the server would have let the choice through.
          const closedToMe = !c.acceptingPatients && !isMine && !isSelf;
          return (
            <div
              key={c.id}
              className={`${cardStyles.clinicianCard} ${isMine ? cardStyles.clinicianCardActive : ""}`}
            >
              <span className={cardStyles.clinicianAvatar} aria-hidden="true">
                {initials(c.name)}
              </span>
              <span className={cardStyles.clinicianText}>
                <span className={cardStyles.clinicianName}>
                  {c.name ?? "Clinician"}
                  {isSelf && " (you)"}
                  {closedToMe && (
                    <span className={cardStyles.clinicianBadgeWarn}>Not accepting new patients</span>
                  )}
                </span>
                <span className={cardStyles.clinicianMeta}>
                  {isMine ? "On your care team" : closedToMe ? "Closed to new patients right now" : "Not on your care team"}
                </span>
              </span>
              <span className={cardStyles.clinicianAction}>
                <button
                  type="button"
                  className={isMine ? styles.cancelBtn : styles.btnSecondary}
                  onClick={() => toggle(c.id, isMine)}
                  disabled={busyId === c.id || (closedToMe && !isMine)}
                  title={closedToMe ? "This clinician is not taking new patients right now." : undefined}
                >
                  {busyId === c.id ? "Saving…" : isMine ? "Remove" : "Choose"}
                </button>
              </span>
            </div>
          );
        })}
      </div>

      {error && <p className={styles.formError}>{error}</p>}
    </div>
  );
}
