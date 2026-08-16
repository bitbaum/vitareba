"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "@/app/(admin)/admin.module.css";
import shared from "@/app/shared.module.css";

/**
 * The doctor decides whether they are taking on new patients. Self-service —
 * there is no admin override, because the whole point is that the clinician
 * controls their own intake, not the clinic on their behalf.
 *
 * Closing this never removes an existing patient's access to their doctor —
 * lib/domain/care-team.ts canPatientChooseClinician always allows an existing
 * relationship to continue. This toggle only ever affects someone choosing this
 * clinician for the first time.
 */
export function AcceptingPatientsToggle() {
  const [accepting, setAccepting] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/clinician/accepting-patients");
      // A plain patient account gets 404 here, on purpose — this card simply
      // does not render for them.
      if (!res.ok) return;
      const { data } = await res.json();
      setAccepting(data?.accepting ?? true);
    } catch {
      // Silent: the card just does not appear rather than showing a broken toggle.
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle() {
    if (accepting === null) return;
    const next = !accepting;
    setSaving(true);
    setError("");
    setAccepting(next); // optimistic — this is a single boolean with an obvious undo
    try {
      const res = await fetch("/api/clinician/accepting-patients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepting: next }),
      });
      if (!res.ok) {
        setAccepting(!next);
        setError("That didn't save — please try again.");
      }
    } catch {
      setAccepting(!next);
      setError("That didn't save — please try again.");
    } finally {
      setSaving(false);
    }
  }

  // Not a clinician account, or still loading: render nothing rather than a
  // flash of a toggle that turns out not to apply.
  if (accepting === null) return null;

  return (
    <div className={styles.cardMb}>
      <p className={styles.cardLabel}>New patients</p>
      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          className={styles.checkboxInput}
          checked={accepting}
          onChange={toggle}
          disabled={saving}
        />
        {accepting ? "Accepting new patients" : "Not accepting new patients"}
      </label>
      <p className={styles.checkboxHint}>
        {accepting
          ? "New patients can choose you and book a first appointment. Your existing patients are never affected by this."
          : "New patients will see you as closed and cannot choose you or book a first appointment. Anyone already in your care keeps full access — this only affects new relationships."}
      </p>
      {error && <p className={shared.formError}>{error}</p>}
    </div>
  );
}
