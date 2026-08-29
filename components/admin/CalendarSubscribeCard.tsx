"use client";

import { useEffect, useState } from "react";
import styles from "@/app/(admin)/admin.module.css";

/**
 * "Is this connected to my calendar?" — yes, by subscription rather than by
 * vendor OAuth: one URL that Google, Apple and Outlook all poll, so every
 * booking, reschedule and cancellation lands in the clinician's own calendar
 * without this app holding anybody's Google account.
 */
export function CalendarSubscribeCard() {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/calendar/subscribe")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (alive) setUrl(body?.data?.url ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!url) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url!);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={styles.cardMb}>
      <p className={styles.cardTitle}>Your calendar feed</p>
      <p className={styles.docMeta}>
        Add this address to Google Calendar (Other calendars → From URL), Apple Calendar (File → New
        Calendar Subscription) or Outlook (Add calendar → Subscribe from web). Your appointments
        then appear — and disappear when cancelled — automatically. Keep the link private; it grants
        read access to your schedule.
      </p>
      <div className={styles.feedUrlRow}>
        <code className={styles.feedUrl}>{url}</code>
        <button type="button" className={styles.btnSecondary} onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
