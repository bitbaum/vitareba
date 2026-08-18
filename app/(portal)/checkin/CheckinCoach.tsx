"use client";

import { useState } from "react";
import shared from "../portal.module.css";
import checkinStyles from "./checkin.module.css";
import { RegulationNotice } from "@/components/RegulationNotice";
import {
  CHECKIN_CHAT_MAX_TURNS,
  CHECKIN_CHAT_MESSAGE_MAX_LENGTH,
  CHECKIN_CHAT_STARTERS,
} from "@/lib/config/portal";
import { sentenceCase } from "@/lib/utils/format";

type Turn = { role: "user" | "assistant"; content: string };
type Gate = { code: "no_consent" | "ai_not_configured"; blockId: string };

/**
 * The conversation a patient can have about their own data the moment they
 * finish checking in — the "so what?" that a bare saved-confirmation never
 * answered. Same house rule as every AI surface: the feature always exists,
 * the law appears as a warning or a one-click consent, never as a dead end.
 *
 * Nothing here is persisted (see the API route): the turns live in this
 * component and are gone when the page is. Anything worth keeping belongs in
 * a message thread with a human, which is one link away.
 */
export function CheckinCoach({ clinicianLabel }: { clinicianLabel: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [gate, setGate] = useState<Gate | null>(null);
  const [dpaWarning, setDpaWarning] = useState(false);
  const [error, setError] = useState("");
  /** Turns the gate refused — replayed verbatim once consent is recorded. */
  const [pending, setPending] = useState<Turn[] | null>(null);

  async function send(history: Turn[]) {
    setLoading(true);
    setError("");
    setGate(null);
    try {
      const res = await fetch("/api/ai/checkin-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-CHECKIN_CHAT_MAX_TURNS) }),
      });
      const data = await res.json();
      if (res.status === 451) {
        setGate({ code: data.code, blockId: data.blockId });
        setPending(history);
        return;
      }
      if (!res.ok || !data.success) {
        setError(data.error ?? "That didn't go through. Please try again.");
        setPending(history);
        return;
      }
      setPending(null);
      setDpaWarning(Boolean(data.data.dpaWarning));
      setTurns([...history, { role: "assistant", content: data.data.reply }]);
    } catch {
      setError("That didn't go through. Please try again.");
      setPending(history);
    } finally {
      setLoading(false);
    }
  }

  function ask(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const history: Turn[] = [...turns, { role: "user", content }];
    setTurns(history);
    setInput("");
    send(history);
  }

  /** One click = explicit, timestamped GDPR Art. 9(2)(a) consent, then it runs. */
  async function consentAndSend() {
    const history = pending ?? turns;
    if (history.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiConsent: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError("Could not record your consent. Please try again.");
        setLoading(false);
        return;
      }
    } catch {
      setError("Could not record your consent. Please try again.");
      setLoading(false);
      return;
    }
    await send(history);
  }

  const canRetry = Boolean(pending) && !gate && !loading;

  return (
    <div className={shared.card}>
      <p className={shared.cardTitle}>Talk it through</p>
      <p className={shared.formHint}>
        Ask what today&apos;s numbers mean. It reads your check-ins, scores and goals — nothing else —
        cites the figures it reasons from, and sends anything clinical to {clinicianLabel}, who sees
        the same data.
      </p>

      {dpaWarning && <RegulationNotice blockId="cloud-ai-processing" reason="dpa_warning" compact />}

      {turns.length > 0 && (
        <div className={`${shared.msgList} ${checkinStyles.coachList}`}>
          {turns.map((t, i) => (
            <div key={i} className={t.role === "user" ? shared.msgRowEnd : shared.msgRow}>
              <div className={t.role === "user" ? shared.msgBubbleAccent : shared.msgBubbleNeutral}>
                {t.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className={shared.msgRow}>
              <p className={shared.msgMeta}>Reading your trends…</p>
            </div>
          )}
        </div>
      )}

      {gate && (
        <>
          <RegulationNotice blockId={gate.blockId} reason={gate.code} compact />
          {gate.code === "no_consent" && (
            <button
              type="button"
              className={`${shared.btnPrimary} ${shared.btnSm} ${checkinStyles.consentBtn}`}
              onClick={consentAndSend}
              disabled={loading}
            >
              {loading ? "Recording consent…" : "I consent — continue"}
            </button>
          )}
        </>
      )}

      {turns.length === 0 && !gate && (
        <div className={checkinStyles.starters}>
          {CHECKIN_CHAT_STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              className={checkinStyles.starterChip}
              onClick={() => ask(s)}
              disabled={loading}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {!gate && (
        <form
          className={shared.composeRow}
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <textarea
            className={shared.composeTextarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={CHECKIN_CHAT_MESSAGE_MAX_LENGTH}
            placeholder={`Anything you'd ask ${clinicianLabel} about today`}
            aria-label="Your message"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
          />
          <button type="submit" className={shared.sendBtn} disabled={loading || !input.trim()}>
            {loading ? "…" : "Ask"}
          </button>
        </form>
      )}

      {error && (
        <p className={shared.formErrorTop}>
          {error}
          {canRetry && (
            <button type="button" className={checkinStyles.retryInline} onClick={() => send(pending!)}>
              Retry
            </button>
          )}
        </p>
      )}

      {turns.length > 0 && (
        <p className={checkinStyles.coachDisclaimer}>
          {sentenceCase(clinicianLabel)} diagnoses and treats. Anything suggested here is a reading
          of your own data to try and review with them — not medical advice, and never about
          medication or supplements.
        </p>
      )}
    </div>
  );
}
