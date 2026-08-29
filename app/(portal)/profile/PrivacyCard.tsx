"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import shared from "../portal.module.css";
import profileStyles from "./profile.module.css";
import { PORTAL_ROUTES } from "@/lib/config/routes";

/**
 * Privacy & data — the patient's GDPR/FADP controls in one card: explicit AI
 * consent (Art. 9(2)(a)), data export (Art. 15/20), erasure request (Art. 17),
 * and the regulatory ledger explaining what the law switches off.
 */
export function PrivacyCard() {
  const [aiConsent, setAiConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletionState, setDeletionState] = useState<"idle" | "confirm" | "sent">("idle");

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.data?.aiConsentAt) setAiConsent(true);
      })
      .catch(() => {
        /* card still works; toggle just starts unchecked */
      });
  }, []);

  async function toggleConsent(next: boolean) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiConsent: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError("Could not save your consent choice. Please try again.");
        return;
      }
      setAiConsent(next);
    } catch {
      setError("Could not save your consent choice. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function requestDeletion() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/account/deletion-request", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError("Could not send the deletion request. Please try again.");
        return;
      }
      setDeletionState("sent");
    } catch {
      setError("Could not send the deletion request. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={shared.card}>
      <p className={shared.cardTitle}>Privacy &amp; data</p>

      <label className={profileStyles.checkboxRow}>
        <input
          type="checkbox"
          className={profileStyles.checkboxInput}
          checked={aiConsent}
          disabled={saving}
          onChange={(e) => toggleConsent(e.target.checked)}
        />
        Allow AI analysis of my clinical data
      </label>
      <p className={profileStyles.checkboxHint}>
        Explicit consent under GDPR Art. 9(2)(a) / Swiss FADP. Enables the AI insight on your
        dashboard and the AI brief your clinician sees. Withdraw any time — it takes effect
        immediately.
      </p>

      <div className={shared.formActions}>
        <a href="/api/account/export" className={`${shared.btnSecondary} ${shared.btnSm}`} download>
          Download my data (JSON)
        </a>
        {deletionState === "idle" && (
          <button
            type="button"
            className={`${shared.btnSecondary} ${shared.btnSm}`}
            onClick={() => setDeletionState("confirm")}
          >
            Request account deletion
          </button>
        )}
        {deletionState === "confirm" && (
          <button
            type="button"
            className={`${shared.btnPrimary} ${shared.btnSm}`}
            disabled={saving}
            onClick={requestDeletion}
          >
            {saving ? "Sending…" : "Confirm deletion request"}
          </button>
        )}
      </div>
      {deletionState === "sent" && (
        <p className={profileStyles.checkboxHint}>
          Request sent. The clinic must respond within one month (GDPR Art. 12(3)); clinical records
          may fall under the Swiss 10-year retention duty — see the regulatory ledger.
        </p>
      )}
      {error && <p className={shared.formErrorTop}>{error}</p>}

      <p className={profileStyles.checkboxHint}>
        <Link href={PORTAL_ROUTES.regulation} className={shared.legalNoticeLink}>
          What the law switches off here, who passed it, and who benefits →
        </Link>
      </p>
    </div>
  );
}
