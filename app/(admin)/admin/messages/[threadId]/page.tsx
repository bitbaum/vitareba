"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import styles from "../../../admin.module.css";
import { formatDateTime } from "@/lib/utils/format";
import { type ThreadDetailWithPatient } from "@/lib/config/messages";
import { MESSAGE_BODY_MAX_LENGTH } from "@/lib/config/portal";
import { ADMIN_ROUTES } from "@/lib/config/routes";
import { useMessageThread } from "@/lib/hooks/useMessageThread";
import { LoadingState } from "@/components/LoadingState";
import { AskAssistant } from "@/components/AskAssistant";

export default function AdminThreadPage() {
  const params = useParams();
  const threadId = params.threadId as string;
  // Loading, polling and sending are shared with the patient's view of this
  // same thread — see lib/hooks/useMessageThread.ts.
  const { thread, loadError, body, setBody, sending, sendError, bottomRef, load, handleSend } =
    useMessageThread<ThreadDetailWithPatient>(threadId);

  if (loadError)
    return <div className={styles.emptyState}>Failed to load thread. Please refresh the page.</div>;
  if (!thread) return <LoadingState />;

  return (
    <div className={styles.threadDetail}>
      <Link href={ADMIN_ROUTES.messages} className={styles.threadBackLink}>
        ← All messages
      </Link>

      <div className={styles.threadMeta}>
        <h1 className={styles.pageTitle}>{thread.subject}</h1>
        <p className={styles.pageSub}>
          Patient: {thread.patient.name ?? thread.patient.email}
          {thread.patient.name && ` · ${thread.patient.email}`}
          {" · "}
          <Link
            href={`${ADMIN_ROUTES.patients}/${thread.patient.id}`}
            className={styles.threadPatientLink}
          >
            View profile →
          </Link>
          {thread.clinician?.name && ` · → ${thread.clinician.name}`}
        </p>
      </div>

      <div className={`${styles.card} ${styles.msgList}`}>
        {thread.messages.map((msg) => (
          // `mine` and the author label are resolved server-side: a thread can
          // now hold a colleague or an assistant, and "admin or patient" no
          // longer describes who is speaking.
          <div
            key={msg.id}
            className={`${styles.msgRow} ${msg.mine ? styles.msgRowAdmin : styles.msgRowPatient}`}
          >
            <div
              className={`${styles.msgBubble} ${msg.mine ? styles.msgBubbleAdmin : styles.msgBubblePatient}`}
            >
              {msg.body}
            </div>
            <p className={styles.msgMeta}>
              {msg.mine ? "You" : msg.authorLabel}
              {msg.authorKind === "ai" && (
                <span title={msg.generatedByModel ?? undefined}> · AI</span>
              )}
              {" · "}
              {formatDateTime(msg.createdAt)}
              {msg.mine && msg.readByOthers && <span className={styles.msgRead}> · Read</span>}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className={styles.card}>
        <form onSubmit={handleSend} className={styles.composeForm}>
          <textarea
            aria-label="Reply"
            className={styles.composeTextarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={MESSAGE_BODY_MAX_LENGTH}
            placeholder="Reply to patient…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
          />
          <button type="submit" className={styles.sendBtn} disabled={sending || !body.trim()}>
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
        {sendError && <p className={styles.formError}>{sendError}</p>}
        {/* Outside the form: asking the assistant is a separate act from replying
            to the patient, and must never be what Enter does. */}
        <AskAssistant threadId={threadId} onPosted={load} />
      </div>
    </div>
  );
}
