"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MESSAGE_POLL_INTERVAL_MS } from "@/lib/config/portal";

/**
 * One secure conversation, loaded and kept live — for whoever is reading it.
 *
 * The patient's thread view and the clinician's thread view are the same
 * conversation from opposite chairs, and they had the same sixty lines of
 * machinery twice over: fetch, poll while the tab is visible, scroll to the
 * newest message, post a reply, clear the box. Duplicated behaviour of this
 * kind does not stay duplicated — the polling interval, or what happens when a
 * send fails, drifts on one side, and a clinician and a patient then disagree
 * about whether a message was delivered.
 *
 * /api/messages/[threadId] is the SAME endpoint for both: the server decides
 * who "you" are and marks each message `mine` accordingly. So the one thing
 * this hook does not know, and does not need to know, is which side is asking.
 * The two pages keep their own markup, wording and routes — those genuinely
 * differ.
 */
export function useMessageThread<T extends { messages: unknown[] }>(threadId: string) {
  const [thread, setThread] = useState<T | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages/${threadId}`);
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const data = await res.json();
      setThread(data.data);
    } catch {
      setLoadError(true);
    }
  }, [threadId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll for new messages while the tab is focused
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) load();
    }, MESSAGE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length]);

  /** Clears the failed state before trying again, so the retry can fail visibly too. */
  const retry = useCallback(() => {
    setLoadError(false);
    load();
  }, [load]);

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

  return {
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
  };
}
