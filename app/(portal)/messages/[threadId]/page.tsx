"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import styles from "../../portal.module.css";
import msgStyles from "../messages.module.css";
import { formatDateTime } from "@/lib/utils/format";
import { MESSAGE_BODY_MAX_LENGTH } from "@/lib/config/portal";
import { PORTAL_ROUTES } from "@/lib/config/routes";
import { type ThreadDetail } from "@/lib/config/messages";
import { useMessageThread } from "@/lib/hooks/useMessageThread";
import { LoadingState } from "@/components/LoadingState";
import { AskAssistant } from "@/components/AskAssistant";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";

export default function ThreadPage() {
  const params = useParams();
  const threadId = params.threadId as string;
  // Loading, polling and sending are shared with the clinician's view of this
  // same thread — see lib/hooks/useMessageThread.ts.
  const {
    thread,
    loadError,
    body,
    setBody,
    sending,
    sendError,
    bottomRef,
    load,
    retry,
    handleSend,
  } = useMessageThread<ThreadDetail>(threadId);

  if (loadError)
    return (
      <div className={styles.emptyState}>
        Could not load this conversation.{" "}
        <button type="button" onClick={retry} className={styles.retryBtn}>
          Retry
        </button>
      </div>
    );
  if (!thread) return <LoadingState />;

  return (
    <div className={msgStyles.threadDetail}>
      <Link href={PORTAL_ROUTES.messages} className={styles.backLink}>
        ← Back to messages
      </Link>
      <PortalPageHeader title={thread.subject} />

      {/* Who is in the room. Shown once a conversation stops being just you and
          your clinician — a patient should never have to guess that a colleague
          or an assistant can read what they write. */}
      {(thread.participants.length > 2 || thread.participants.some((p) => p.kind === "ai")) && (
        <p className={msgStyles.participants}>
          In this conversation:{" "}
          {thread.participants
            .filter((p) => !p.hasLeft)
            .map((p) => p.label)
            .join(" · ")}
        </p>
      )}

      <div className={`${styles.card} ${msgStyles.msgScroll}`}>
        {thread.messages.map((msg) => (
          // Who wrote this is resolved server-side: with more than two people in
          // a thread the client can no longer infer it from a role.
          <div key={msg.id} className={msg.mine ? styles.msgRowEnd : styles.msgRow}>
            <div className={msg.mine ? styles.msgBubbleAccent : styles.msgBubbleNeutral}>
              {msg.body}
            </div>
            <p className={styles.msgMeta}>
              {msg.mine ? "You" : msg.authorLabel}
              {msg.authorKind === "ai" && (
                <span className={msgStyles.aiTag} title={msg.generatedByModel ?? undefined}>
                  AI
                </span>
              )}{" "}
              · {formatDateTime(msg.createdAt)}
              {msg.mine && msg.readByOthers && <span className={styles.msgRead}> · Read</span>}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className={styles.card}>
        <form onSubmit={handleSend} className={styles.composeRow}>
          <textarea
            aria-label="Message"
            className={styles.composeTextarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={MESSAGE_BODY_MAX_LENGTH}
            placeholder="Type a message…"
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
        {sendError && <p className={styles.formErrorTop}>{sendError}</p>}
        {/* Outside the form: asking the assistant is a separate act from writing
            to your clinician, and must never be what Enter does. */}
        <AskAssistant threadId={threadId} onPosted={load} />
      </div>
    </div>
  );
}
