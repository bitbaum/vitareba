"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import styles from "../portal.module.css";
import authStyles from "../../forms.module.css";
import msgStyles from "./messages.module.css";
import { formatDateNumeric } from "@/lib/utils/format";
import { COMPANY } from "@/lib/config/company";
import { type ThreadListItem, type ThreadClinician } from "@/lib/config/messages";
import { MESSAGE_SUBJECT_MAX_LENGTH, MESSAGE_BODY_MAX_LENGTH } from "@/lib/config/portal";
import { PORTAL_ROUTES } from "@/lib/config/routes";
import { LoadingState } from "@/components/LoadingState";

type Clinician = NonNullable<ThreadClinician>;

/** Neutral wording for every place a real clinician name isn't known yet. */
const UNKNOWN_CLINICIAN = "your clinician";
const UNKNOWN_RECIPIENT = `the ${COMPANY.shortName} team`;

export default function MessagesPage() {
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Recipient picker: the patient's own care team, or — when nobody treats them
  // yet — the whole roster, so they can still reach a real person.
  const [recipients, setRecipients] = useState<Clinician[]>([]);
  const [hasCareTeam, setHasCareTeam] = useState(true);
  const [recipientId, setRecipientId] = useState("");

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch("/api/messages");
      if (!res.ok) { setLoadError(true); return; }
      const data = await res.json();
      setThreads(data.data ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/care-team");
        if (!res.ok) return; // picker degrades to "no recipient" — server still defaults
        const { data } = await res.json();
        const roster: Clinician[] = data?.clinicians ?? [];
        const mine: string[] = data?.mine ?? [];
        const own = roster.filter((c) => mine.includes(c.id));
        setHasCareTeam(own.length > 0);
        const options = own.length > 0 ? own : roster;
        setRecipients(options);
        // First care-team member = the primary clinician the server would pick.
        setRecipientId(options[0]?.id ?? "");
      } catch {
        // leave the picker empty; the thread simply goes to the clinic mailbox
      }
    })();
  }, []);

  const selected = recipients.find((c) => c.id === recipientId) ?? null;
  const selectedName = selected?.name ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body, clinicianId: recipientId || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSubmitError("Failed to send message. Please try again.");
        return;
      }
      setSubject("");
      setBody("");
      setShowForm(false);
      load();
    } catch {
      setSubmitError("Failed to send message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>
            My <em>Messages</em>
          </h1>
          <p className={styles.pageSub}>
            Direct line to {selectedName ?? UNKNOWN_CLINICIAN} — secure and asynchronous
          </p>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={() => setShowForm(!showForm)}>
          + New message
        </button>
      </div>

      {showForm && (
        <div className={`${styles.card} ${styles.cardGap}`}>
          <p className={styles.cardTitle}>New message</p>
          <p className={styles.formHint}>
            Goes straight to {selectedName ?? UNKNOWN_RECIPIENT}, who reads and responds
            personally — typically within 24 hours on weekdays.
          </p>
          <form onSubmit={handleSubmit} className={styles.formStack}>
            {recipients.length > 0 && (
              <div className={authStyles.field}>
                <label className={authStyles.label} htmlFor="recipient">To</label>
                <select
                  id="recipient"
                  className={authStyles.input}
                  value={recipientId}
                  onChange={(e) => setRecipientId(e.target.value)}
                >
                  {recipients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name ?? "Clinician"}</option>
                  ))}
                </select>
                {!hasCareTeam && (
                  <p className={msgStyles.recipientHint}>
                    No clinician is assigned to you yet — pick anyone on the team.
                  </p>
                )}
              </div>
            )}
            <div className={authStyles.field}>
              <label className={authStyles.label} htmlFor="subject">Subject</label>
              <input id="subject" className={authStyles.input} value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={MESSAGE_SUBJECT_MAX_LENGTH} placeholder="e.g. Question about my medication protocol" />
            </div>
            <div className={authStyles.field}>
              <label className={authStyles.label} htmlFor="body">Message</label>
              <textarea
                id="body"
                className={styles.formTextarea}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                maxLength={MESSAGE_BODY_MAX_LENGTH}
                placeholder={`Write anything you'd want ${selectedName ?? UNKNOWN_CLINICIAN} to know — symptoms, questions, observations…`}
              />
            </div>
            {submitError && <p className={styles.formError}>{submitError}</p>}
            <div className={styles.formActions}>
              <button type="submit" className={`${styles.btnPrimary} ${styles.formActionPrimary}`} disabled={submitting}>
                {submitting ? "Sending…" : "Send message"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className={styles.cancelBtn}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : loadError ? (
        <div className={styles.card}>
          <div className={styles.emptyState}>
            Could not load messages.{" "}
            <button type="button" onClick={load} className={styles.retryBtn}>
              Retry
            </button>
          </div>
        </div>
      ) : threads.length === 0 ? (
        <div className={styles.card}>
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>No messages yet</p>
            <p>This is your direct line to your care team at {COMPANY.shortName}. Use it for questions between sessions, updates on how you&apos;re responding to your programme, or anything you&apos;d want your clinician to know.</p>
            <button
              type="button"
              className={styles.emptyAction}
              onClick={() => setShowForm(true)}
            >
              Send a message →
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.listStack}>
          {threads.map((t) => {
            const lastMsg = t.messages[0];
            const isUnread = !!lastMsg && lastMsg.senderId !== t.patient.id && lastMsg.readAt === null;
            return (
              <Link key={t.id} href={`${PORTAL_ROUTES.messages}/${t.id}`} className={msgStyles.threadLink}>
                <div className={styles.card}>
                  <div className={msgStyles.threadRow}>
                    <div className={msgStyles.threadSubjectRow}>
                      {isUnread && <span className={styles.unreadDot} role="img" aria-label="Unread" />}
                      <p className={`${msgStyles.threadSubject}${isUnread ? ` ${msgStyles.threadSubjectUnread}` : ""}`}>
                        {t.subject}
                      </p>
                    </div>
                    <p className={msgStyles.threadDate}>
                      {formatDateNumeric(t.lastMessageAt)}
                    </p>
                  </div>
                  {t.clinician?.name && (
                    <p className={msgStyles.threadRecipient}>with {t.clinician.name}</p>
                  )}
                  {lastMsg && (
                    <p className={msgStyles.threadPreview}>
                      {lastMsg.body}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
