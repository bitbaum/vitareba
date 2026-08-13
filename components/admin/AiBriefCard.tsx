"use client";

import { useState } from "react";
import styles from "@/app/(admin)/admin.module.css";
import shared from "@/app/shared.module.css";
import { RegulationNotice } from "@/components/RegulationNotice";

type Gate = { code: "no_consent" | "ai_not_configured"; blockId: string };
type Output = { kind: "brief" | "differential"; text: string; dpaWarning: boolean; deviceWarning: boolean };

/**
 * Clinician-side AI. Both features run (house rule: the law is a warning,
 * not a wall): the pre-consultation brief, and the differential discussion
 * aid — the thing MDR would call a device if it diagnosed; it hypothesises
 * instead, and its output always renders under the device warning.
 * Patient consent is the one gate that stays: it is the PATIENT's data.
 */
export function AiBriefCard({ patientId }: { patientId: string }) {
  const [output, setOutput] = useState<Output | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"brief" | "differential" | null>(null);

  async function run(kind: "brief" | "differential") {
    setLoading(kind);
    setError("");
    setGate(null);
    try {
      const endpoint =
        kind === "brief"
          ? `/api/admin/patients/${patientId}/ai-brief`
          : `/api/admin/patients/${patientId}/ai-differential`;
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();
      if (res.status === 451) {
        setGate({ code: data.code, blockId: data.blockId });
        return;
      }
      if (!res.ok || !data.success) {
        setError(data.error ?? "AI request failed. Please try again.");
        return;
      }
      setOutput({
        kind,
        text: kind === "brief" ? data.data.brief : data.data.differential,
        dpaWarning: Boolean(data.data.dpaWarning),
        deviceWarning: Boolean(data.data.deviceWarning),
      });
    } catch {
      setError("AI request failed. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className={styles.card}>
      <p className={styles.cardLabel}>AI</p>

      {output ? (
        <>
          {output.deviceWarning && <RegulationNotice blockId="ai-diagnosis" reason="device_warning" />}
          {output.dpaWarning && <RegulationNotice blockId="cloud-ai-processing" reason="dpa_warning" />}
          <p className={shared.aiOutput}>{output.text}</p>
        </>
      ) : gate ? (
        <>
          <RegulationNotice blockId={gate.blockId} reason={gate.code} />
          {gate.code === "no_consent" && (
            <p className={styles.cellSub}>
              This patient hasn&apos;t given AI consent yet — it&apos;s one toggle in their
              Profile → Privacy &amp; data, or one click on their own dashboard AI card.
            </p>
          )}
        </>
      ) : (
        <div className={styles.aiActions}>
          <button
            type="button"
            className={styles.headerBtn}
            onClick={() => run("brief")}
            disabled={loading !== null}
          >
            {loading === "brief" ? "Compiling…" : "Pre-consultation brief"}
          </button>
          <button
            type="button"
            className={styles.headerBtn}
            onClick={() => run("differential")}
            disabled={loading !== null}
          >
            {loading === "differential" ? "Hypothesising…" : "Differential discussion aid"}
          </button>
        </div>
      )}
      {error && <p className={styles.formError}>{error}</p>}
    </div>
  );
}
