"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import styles from "../../portal.module.css";
import msgStyles from "../messages.module.css";
import { formatDateTime } from "@/lib/utils/format";
import { USER_ROLE } from "@/lib/config/auth";
import { COMPANY } from "@/lib/config/company";
import { MESSAGE_POLL_INTERVAL_MS, MESSAGE_BODY_MAX_LENGTH } from "@/lib/config/portal";
import { PORTAL_ROUTES } from "@/lib/config/routes";
import { type ThreadDetail } from "@/lib/config/messages";
import { LoadingState } from "@/components/LoadingState";

export default function ThreadPage() {
  const params = useParams();
  const threadId = params.threadId as string;
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages/${threadId}`);
      if (!res.ok) { setLoadError(true); return; }
      const data = await res.json();
      setThread(data.data);
    } catch {
      setLoadError(true);
    }
  }, [threadId]);

  useEffect(() => { load(); }, [load]);

  // Poll for new messages every 30 s while the tab is focused
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) load();
    }, MESSAGE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [thread?.messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setSendError("");
    try {
      const res = await fetch(`/api/messages/${threadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        setSendError("Failed to send. Please try again.");
        return;
      }
      setBody("");
      load();
    } catch {
      setSendError("Failed to send. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (loadError) return (
    <div className={styles.emptyState}>
      Could not load this conversation.{" "}
      <button type="button" onClick={() => { setLoadError(false); load(); }} className={styles.retryBtn}>
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
      <h1 className={styles.pageTitle}>{thread.subject}</h1>

      <div className={`${styles.card} ${msgStyles.msgScroll}`}>
        {thread.messages.map((msg) => {
          const isAdmin = msg.sender.role === USER_ROLE.admin;
          return (
            <div key={msg.id} className={isAdmin ? styles.msgRow : styles.msgRowEnd}>
              <div className={isAdmin ? styles.msgBubbleNeutral : styles.msgBubbleAccent}>
                {msg.body}
              </div>
              <p className={styles.msgMeta}>
                {isAdmin ? `${COMPANY.shortName} team` : "You"} · {formatDateTime(msg.createdAt)}
                {!isAdmin && msg.readAt && <span className={styles.msgRead}> · Read</span>}
              </p>
            </div>
          );
        })}
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
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
          />
          <button type="submit" className={styles.sendBtn} disabled={sending || !body.trim()}>
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
        {sendError && <p className={styles.formErrorTop}>{sendError}</p>}
      </div>
    </div>
  );
}
