"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import portalStyles from "../portal.module.css";
import styles from "./care-team.module.css";
import { PORTAL_ROUTES } from "@/lib/config/routes";
import { LoadingState } from "@/components/LoadingState";

type Clinician = { id: string; name: string | null; acceptingPatients: boolean };

/** Two-letter monogram — same idiom as the booking picker's clinician avatar. */
function initials(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The patient's own hub for "who treats me": choose a clinician, switch to
 * another, jump straight into a message thread or the booking picker with
 * them pre-selected. Previously this lived as a small card buried on the
 * profile page with no way to act on a clinician beyond add/remove — a
 * patient who wanted to message or book a *specific* doctor still had to
 * leave, guess the right recipient in a dropdown, or land on whichever
 * clinician the booking picker defaulted to.
 *
 * A clinician who has closed intake is never hidden — an existing patient
 * must still be able to find their own doctor in this list — but a NEW
 * choice of them is refused, server-side, with the same rule the booking
 * flow enforces (lib/domain/care-team.ts canPatientChooseClinician). A
 * dual-role clinician can always choose (or message, or book) themselves
 * regardless of their own intake setting — the same self-exemption already
 * proven live on the booking picker and the old profile card.
 */
export function CareTeamPanel({ selfId }: { selfId: string }) {
  const router = useRouter();
  const [clinicians, setClinicians] = useState<Clinician[]>([]);
  const [mine, setMine] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch("/api/care-team");
      if (!res.ok) { setLoadError(true); return; }
      const { data } = await res.json();
      setClinicians(data?.clinicians ?? []);
      setMine(data?.mine ?? []);
    } catch {
      setLoadError(true);
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

  if (loading) return <LoadingState />;

  if (loadError) {
    return (
      <div className={portalStyles.card}>
        <div className={portalStyles.emptyState}>
          Could not load your care team.{" "}
          <button type="button" onClick={load} className={portalStyles.retryBtn}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (clinicians.length === 0) {
    return (
      <div className={portalStyles.card}>
        <div className={portalStyles.emptyState}>
          <p className={portalStyles.emptyTitle}>No clinicians yet</p>
          <p>The clinic hasn&apos;t added a clinician to the roster yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.clinicianRow}>
      {clinicians.map((c) => {
        const isMine = mine.includes(c.id);
        const isSelf = c.id === selfId;
        // Closed intake only stops a NEW choice — an existing member keeps
        // full access, exactly as before this feature existed. A dual-role
        // clinician can ALWAYS choose (or message, or book) themselves
        // regardless of their own intake setting — caught live: without this
        // exemption, George's own card showed "not accepting" against
        // himself the moment he closed his own intake.
        const closedToMe = !c.acceptingPatients && !isMine && !isSelf;
        return (
          <div
            key={c.id}
            className={closedToMe ? `${styles.clinicianCard} ${styles.clinicianCardClosed}` : styles.clinicianCard}
          >
            <span className={styles.clinicianAvatar} aria-hidden="true">
              {initials(c.name)}
            </span>
            <div className={styles.clinicianBody}>
              <span className={styles.clinicianText}>
                <span className={styles.clinicianName}>
                  <Link href={`${PORTAL_ROUTES.careTeam}/${c.id}`} className={styles.clinicianNameLink}>
                    {c.name ?? "Clinician"}
                  </Link>
                  {isSelf && " (you)"}
                  {closedToMe && (
                    <span className={styles.clinicianBadgeWarn}>Not accepting new patients</span>
                  )}
                </span>
                <span className={styles.clinicianMeta}>
                  {isMine ? "On your care team" : closedToMe ? "Closed to new patients right now" : "Not on your care team"}
                </span>
              </span>

              <div className={styles.actionRow}>
                <Link
                  href={`${PORTAL_ROUTES.messages}?to=${c.id}`}
                  className={portalStyles.btnSecondary}
                >
                  Message
                </Link>
                <Link
                  href={`${PORTAL_ROUTES.bookings}?clinicianId=${c.id}`}
                  className={portalStyles.btnSecondary}
                >
                  Book
                </Link>
                <button
                  type="button"
                  className={portalStyles.btnSecondary}
                  onClick={() => toggle(c.id, isMine)}
                  disabled={busyId === c.id || (closedToMe && !isMine)}
                  title={closedToMe ? "This clinician is not taking new patients right now." : undefined}
                >
                  {busyId === c.id ? "Saving…" : isMine ? "Remove" : "Choose"}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {error && <p className={portalStyles.formError}>{error}</p>}
    </div>
  );
}
