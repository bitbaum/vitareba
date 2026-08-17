"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import styles from "../../portal.module.css";
import msgStyles from "../messages.module.css";
import { formatDateTime } from "@/lib/utils/format";
import { MESSAGE_POLL_INTERVAL_MS, MESSAGE_BODY_MAX_LENGTH } from "@/lib/config/portal";
import { PORTAL_ROUTES } from "@/lib/config/routes";
import { type ThreadDetail } from "@/lib/config/messages";
import { LoadingState } from "@/components/LoadingState";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";

export default function ThreadPage() {
  const params = useParams();
  const threadId = params.threadId as string;
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [asking, setAsking] = useState(false);
  const [assistantNote, setAssistantNote] = useState("");
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

  // The assistant only ever speaks when asked, and posts into the SAME thread
  // your clinician reads — brainstorming together means everyone sees the same
  // reply, not a private lookup only you can see.
  async function handleAskAssistant() {
    setAsking(true);
    setAssistantNote("");
    try {
      const res = await fetch(`/api/messages/${threadId}/assistant`, { method: "POST" });
      const data = await res.json().catch(() => null);

      if (res.status === 451) {
        // The legal gate, not a failure — say which one so it is actionable
        // rather than a dead end.
        setAssistantNote(
          data?.code === "no_consent"
            ? "Turn on AI in your profile's privacy settings to bring the assistant into this thread."
            : "No AI provider is configured for this deployment."
        );
        return;
      }
      if (!res.ok) {
        setAssistantNote("The assistant could not be reached. Please try again.");
        return;
      }
      if (data?.data?.posted === false) {
        setAssistantNote("The assistant had nothing to add.");
        return;
      }
      load();
    } catch {
      setAssistantNote("The assistant could not be reached. Please try again.");
    } finally {
      setAsking(false);
    }
  }

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
      <PortalPageHeader title={thread.subject} />

      {/* Who is in the room. Shown once a conversation stops being just you and
          your clinician — a patient should never have to guess that a colleague
          or an assistant can read what they write. */}
      {(thread.participants.length > 2 ||
        thread.participants.some((p) => p.kind === "ai")) && (
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
              {msg.mine && msg.readByOthers && (
                <span className={styles.msgRead}> · Read</span>
              )}
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
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
          />
          <div className={msgStyles.composeActions}>
            {/* Brainstorming together: the assistant reads this same thread and
                replies into it, so your clinician sees exactly what it said —
                not a private chat only you have access to. */}
            <button
              type="button"
              className={msgStyles.assistantBtn}
              onClick={handleAskAssistant}
              disabled={asking}
              title="Brings the assistant into this conversation. Your clinician sees its reply too."
            >
              {asking ? "Asking…" : "Ask assistant"}
            </button>
            <button type="submit" className={styles.sendBtn} disabled={sending || !body.trim()}>
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
        {sendError && <p className={styles.formErrorTop}>{sendError}</p>}
        {assistantNote && <p className={msgStyles.assistantNote}>{assistantNote}</p>}
      </div>
    </div>
  );
}
