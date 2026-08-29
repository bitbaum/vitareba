"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "@/app/(admin)/admin.module.css";
import { MESSAGE_SUBJECT_MAX_LENGTH, MESSAGE_BODY_MAX_LENGTH } from "@/lib/config/portal";
import { ADMIN_ROUTES } from "@/lib/config/routes";

export function InlineMessageCompose({ patientId }: { patientId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sentThreadId, setSentThreadId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim(), patientId }),
      });
      const data = await res.json();
      if (!data.success) {
        setError("Failed to send message.");
        return;
      }
      setSentThreadId(data.data?.threadId ?? data.data?.id ?? null);
      setExpanded(false);
      setSubject("");
      setBody("");
    } catch {
      setError("Failed to send message.");
    } finally {
      setSending(false);
    }
  }

  if (sentThreadId) {
    return (
      <div className={styles.composeSent}>
        Sent —{" "}
        <Link href={`${ADMIN_ROUTES.messages}/${sentThreadId}`} className={styles.composeSentLink}>
          View conversation →
        </Link>
      </div>
    );
  }

  if (!expanded) {
    return (
      <button type="button" onClick={() => setExpanded(true)} className={styles.composeNewBtn}>
        New message +
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={styles.composeForm}>
      <input
        type="text"
        aria-label="Message subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        maxLength={MESSAGE_SUBJECT_MAX_LENGTH}
        placeholder="Subject"
        className={styles.composeInput}
      />
      <textarea
        aria-label="Message body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={MESSAGE_BODY_MAX_LENGTH}
        placeholder="Write a message…"
        rows={3}
        className={styles.composeTextarea}
      />
      {error && <p className={styles.assignError}>{error}</p>}
      <div className={styles.goalFormActions}>
        <button
          type="submit"
          disabled={sending || !subject.trim() || !body.trim()}
          className={styles.composeSend}
        >
          {sending ? "Sending…" : "Send"}
        </button>
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setError("");
          }}
          aria-label="Discard message and close compose form"
          className={styles.composeCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
