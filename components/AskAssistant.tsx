"use client";

import { useState } from "react";
import styles from "./AskAssistant.module.css";
import { RegulationNotice } from "@/components/RegulationNotice";

/**
 * "Ask the assistant" for a message thread — used by both the patient portal and
 * the admin thread view.
 *
 * One component rather than two because the decision it renders is the same on
 * both sides: the assistant posts INTO the thread, so everyone in the room reads
 * the reply. The only thing that differs is whose consent the legal gate checked,
 * and the server answers that (`consentIsYours`) rather than the caller guessing.
 * A clinician offered "I consent" would record their own consent, leave the gate
 * shut, and look like a broken button.
 */

type Gate = { blockId: string } & (
  { code: "ai_not_configured" } | { code: "no_consent"; consentIsYours: boolean }
);

export function AskAssistant({
  threadId,
  onPosted,
}: {
  threadId: string;
  /** Called after a reply lands, so the thread can refetch and show it. */
  onPosted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState<Gate | null>(null);
  const [note, setNote] = useState("");
  const [dpaWarning, setDpaWarning] = useState(false);

  async function ask() {
    setBusy(true);
    setNote("");
    setGate(null);
    setDpaWarning(false);
    try {
      const res = await fetch(`/api/messages/${threadId}/assistant`, { method: "POST" });
      const data = await res.json().catch(() => null);

      if (res.status === 451) {
        // The legal gate, not a failure. RegulationNotice names the law.
        setGate({ blockId: data?.blockId ?? "cloud-ai-processing", ...data });
        return;
      }
      if (!res.ok || !data?.success) {
        setNote("The assistant could not be reached. Please try again.");
        return;
      }
      if (data.data?.posted === false) {
        setNote("The assistant had nothing to add.");
        return;
      }
      // House rule: an unsigned DPA is a warning, not a wall — it ran, and the
      // reply is in the thread. Say what was crossed rather than hiding it.
      if (data.data?.dpaWarning) setDpaWarning(true);
      onPosted();
    } catch {
      setNote("The assistant could not be reached. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /** One click = explicit, timestamped GDPR Art. 9(2)(a) consent, then run. */
  async function consentAndAsk() {
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiConsent: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setNote("Could not record your consent. Please try again.");
        setBusy(false);
        return;
      }
    } catch {
      setNote("Could not record your consent. Please try again.");
      setBusy(false);
      return;
    }
    await ask();
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.btn}
        onClick={ask}
        disabled={busy}
        title="Posts an AI reply into this conversation. Everyone in it sees the reply, labelled as AI."
      >
        {busy ? "Asking…" : "Ask assistant"}
      </button>

      {dpaWarning && <RegulationNotice blockId="cloud-ai-processing" reason="dpa_warning" />}

      {gate && (
        <>
          <RegulationNotice
            blockId={gate.blockId}
            reason={
              gate.code === "no_consent"
                ? gate.consentIsYours
                  ? "no_consent"
                  : "no_patient_consent"
                : "ai_not_configured"
            }
          />
          {gate.code === "no_consent" && gate.consentIsYours && (
            <button
              type="button"
              className={styles.consentBtn}
              onClick={consentAndAsk}
              disabled={busy}
            >
              {busy ? "Recording consent…" : "I consent — ask anyway"}
            </button>
          )}
        </>
      )}

      {note && <p className={styles.note}>{note}</p>}
    </div>
  );
}
