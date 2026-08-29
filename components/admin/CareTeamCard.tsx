"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/(admin)/admin.module.css";

type Clinician = { id: string; name: string | null };

/**
 * Which doctors treat this patient. Symmetric pairs are fine — clinicians can
 * be each other's patients (that is how George dogfoods both sides).
 */
export function CareTeamCard({
  patientId,
  clinicians,
  members,
}: {
  patientId: string;
  clinicians: Clinician[];
  members: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function toggle(clinicianId: string, isMember: boolean) {
    setBusy(clinicianId);
    setError("");
    try {
      const res = await fetch(`/api/admin/patients/${patientId}/care-team`, {
        method: isMember ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicianId }),
      });
      if (!res.ok) {
        setError("Could not update the care team. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not update the care team. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.card}>
      <p className={styles.cardLabel}>Care team</p>
      {clinicians.length === 0 ? (
        <div className={styles.emptyState}>No clinicians registered.</div>
      ) : (
        <div className={styles.careTeamList}>
          {clinicians.map((c) => {
            const isMember = members.includes(c.id);
            return (
              <div key={c.id} className={styles.careTeamRow}>
                <span className={styles.cellName}>{c.name ?? "Clinician"}</span>
                {isMember && (
                  <span className={styles.badge} data-signal="active">
                    Treating
                  </span>
                )}
                <button
                  type="button"
                  // Add and remove are not the same weight of action — both
                  // rendering as the same bold primary button gave neither
                  // any visual signal of which one changes a patient's care.
                  className={isMember ? styles.removeBtn : styles.headerBtn}
                  disabled={busy === c.id}
                  onClick={() => toggle(c.id, isMember)}
                >
                  {busy === c.id ? "…" : isMember ? "Remove" : "Add to care team"}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {error && <p className={styles.formError}>{error}</p>}
    </div>
  );
}
