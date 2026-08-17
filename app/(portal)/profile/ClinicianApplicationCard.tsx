"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "../portal.module.css";
import { LoadingState } from "@/components/LoadingState";
import { CLINICIAN_APPLICATION_MESSAGE_MAX_LENGTH } from "@/lib/config/portal";

type Application = {
  id: string;
  status: "pending" | "approved" | "declined";
  message: string;
  reviewNote: string | null;
  createdAt: string;
};

/**
 * Every account starts as a patient. This is the one door to becoming a
 * clinician — a message an admin reviews, not a role a patient can just flip
 * on themselves. Hidden entirely once already a clinician: there is nothing
 * left to apply for.
 */
export function ClinicianApplicationCard({ isClinician }: { isClinician: boolean }) {
  const [application, setApplication] = useState<Application | null | undefined>(undefined);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/clinician-applications");
      if (!res.ok) return;
      const body = await res.json();
      setApplication(body.data ?? null);
    } catch {
      setApplication(null);
    }
  }, []);

  useEffect(() => {
    if (!isClinician) load();
  }, [isClinician, load]);

  if (isClinician) return null;
  if (application === undefined) return <LoadingState lines={1} />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/clinician-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        setError(body?.error ?? "Could not submit your application. Please try again.");
        return;
      }
      setMessage("");
      await load();
    } catch {
      setError("Could not submit your application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (application?.status === "pending") {
    return (
      <div className={`${styles.card} ${styles.cardGap}`}>
        <p className={styles.cardTitle}>Clinician application</p>
        <p className={styles.formHint}>
          Your application is pending review. We&apos;ll let you know once a decision is made.
        </p>
      </div>
    );
  }

  return (
    <div className={`${styles.card} ${styles.cardGap}`}>
      <p className={styles.cardTitle}>Are you a clinician?</p>
      {application?.status === "declined" && (
        <p className={styles.formHint}>
          Your previous application wasn&apos;t approved
          {application.reviewNote ? `: ${application.reviewNote}` : "."} You&apos;re welcome to apply again.
        </p>
      )}
      <p className={styles.formHint}>
        Tell us about your credentials and why you&apos;d like to join the care team — an admin reviews every application personally.
      </p>
      <form onSubmit={handleSubmit} className={styles.formStack}>
        <textarea
          className={styles.formTextarea}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={CLINICIAN_APPLICATION_MESSAGE_MAX_LENGTH}
          placeholder="Your qualifications, licence, and why you'd like to treat patients here…"
          required
        />
        {error && <p className={styles.formError}>{error}</p>}
        <button type="submit" className={styles.btnSecondary} disabled={submitting}>
          {submitting ? "Submitting…" : "Apply to become a clinician"}
        </button>
      </form>
    </div>
  );
}
