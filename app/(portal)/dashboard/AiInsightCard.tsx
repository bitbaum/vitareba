"use client";

import { useState } from "react";
import shared from "../portal.module.css";
import { RegulationNotice } from "@/components/RegulationNotice";

type Gate = { code: "no_consent" | "ai_not_configured"; blockId: string };

/**
 * AI reflection over the patient's own tracked data. House rule: the feature
 * always exists and runs — the law appears as a warning, not a wall. Missing
 * consent becomes consent-at-click (recorded, auditable, then it runs); a
 * provider without a DPA still runs but the output carries the warning.
 */
export function AiInsightCard() {
  const [insight, setInsight] = useState<string | null>(null);
  const [dpaWarning, setDpaWarning] = useState(false);
  const [gate, setGate] = useState<Gate | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    setError("");
    setGate(null);
    try {
      const res = await fetch("/api/ai/insight", { method: "POST" });
      const data = await res.json();
      if (res.status === 451) {
        setGate({ code: data.code, blockId: data.blockId });
        return;
      }
      if (!res.ok || !data.success) {
        setError(data.error ?? "AI insight failed. Please try again.");
        return;
      }
      setInsight(data.data.insight);
      setDpaWarning(Boolean(data.data.dpaWarning));
    } catch {
      setError("AI insight failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  /** One click = explicit, timestamped GDPR Art. 9(2)(a) consent, then run. */
  async function consentAndGenerate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiConsent: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError("Could not record your consent. Please try again.");
        return;
      }
    } catch {
      setError("Could not record your consent. Please try again.");
      setLoading(false);
      return;
    }
    await generate();
  }

  return (
    <div className={shared.card}>
      <p className={shared.cardTitle}>AI insight</p>
      {insight ? (
        <>
          {dpaWarning && <RegulationNotice blockId="cloud-ai-processing" reason="dpa_warning" />}
          <p className={shared.aiOutput}>{insight}</p>
        </>
      ) : gate ? (
        <>
          <RegulationNotice blockId={gate.blockId} reason={gate.code} />
          {gate.code === "no_consent" && (
            <button
              type="button"
              className={`${shared.btnPrimary} ${shared.btnSm}`}
              onClick={consentAndGenerate}
              disabled={loading}
            >
              {loading ? "Recording consent…" : "I consent — generate anyway"}
            </button>
          )}
        </>
      ) : (
        <>
          <p className={shared.formHint}>
            A short AI reflection on your recent check-ins, scores and goals — your data, read back
            to you.
          </p>
          <button
            type="button"
            className={`${shared.btnPrimary} ${shared.btnSm}`}
            onClick={generate}
            disabled={loading}
          >
            {loading ? "Reading your trends…" : "Generate my insight"}
          </button>
        </>
      )}
      {error && <p className={shared.formErrorTop}>{error}</p>}
    </div>
  );
}
