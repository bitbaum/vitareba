import { eq } from "drizzle-orm";
import { runAiTurn, type CompleteFn } from "threadkit";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { aiChat, isAiConfigured } from "@/lib/ai";
import { ASSISTANT_ACTOR_ID, PARTICIPANT_ROLE } from "@/lib/config/messages";
import { COMPANY } from "@/lib/config/company";
import { addParticipant, loadThread, postMessage } from "@/lib/domain/messages";

/**
 * The assistant as a participant in a patient thread.
 *
 * It is a participant, not a feature bolted onto the thread: it reads through
 * the same visibility window as every human, so it sees nothing said before it
 * was invited. `threadkit` enforces that; this module only supplies the model.
 */

/**
 * The prompt is written for the PATIENT, always — even when a clinician is the
 * one who asked.
 *
 * In a shared thread everyone reads every message, so the audience is not
 * whoever pressed the button; it is the most vulnerable person in the room.
 * The repo's clinician-facing prompt (differentialPrompt) deliberately
 * speculates about diagnoses, which is appropriate in a clinician's private
 * view and is not appropriate here, where the patient sees the reply.
 */
export function threadAssistantPrompt(): string {
  return (
    `You are the ${COMPANY.assistantName}, taking part in a secure message thread ` +
    "between a patient and their clinician at a metabolic-psychiatry practice. " +
    "You are not a clinician and not a medical device. " +
    "Help with practical, everyday things: explaining what a term means in plain " +
    "language, helping someone put a question into words for their next consultation, " +
    "or summarising what has already been said in this thread. " +
    "Warm, brief, plain language, second person. " +
    "Never diagnose, never interpret results, never give medical advice, and never " +
    "suggest starting, stopping or changing any medication or dose. " +
    "For anything clinical, say plainly that it is a question for their clinician, " +
    "and offer to help them phrase it. " +
    "If someone describes a medical emergency or intent to harm themselves, do not " +
    "counsel them: tell them to contact emergency services or their clinician now. " +
    "Answer only from what is in this thread — if you do not know, say so rather " +
    "than guessing."
  );
}

/** threadkit's model seam, satisfied by this app's configured provider. */
const complete: CompleteFn = async ({ system, prompt, maxTokens }) => {
  const result = await aiChat({ system, user: prompt, maxTokens });
  // threadkit treats a thrown error as a failed turn; a returned empty string
  // becomes a "model returned nothing" skip. Failing loudly is better here —
  // the caller distinguishes a provider outage from a deliberate silence.
  if (!result.ok) throw new Error(result.error);
  return result.text;
};

export type AssistantTurn =
  | { status: "posted"; body: string }
  | { status: "skipped"; reason: string }
  | { status: "blocked"; code: "ai_not_configured" }
  // `consentIsYours` exists so the UI never offers "I consent" to someone whose
  // consent is not the one being checked. A clinician clicking it would record
  // their own consent, leave the gate shut, and look like a broken button.
  | { status: "blocked"; code: "no_consent"; consentIsYours: boolean }
  | { status: "not-found" };

/**
 * Run one assistant turn in a thread, on demand.
 *
 * Deliberately NOT automatic on every message: a clinical conversation should
 * not acquire a third voice without someone asking for it. A participant calls
 * this, and that call is also what invites the assistant the first time.
 */
export async function runThreadAssistant(
  threadId: string,
  requesterId: string
): Promise<AssistantTurn> {
  if (!isAiConfigured()) return { status: "blocked", code: "ai_not_configured" };

  const loaded = await loadThread(threadId);
  if (!loaded) return { status: "not-found" };

  // The requester must be in the thread. Checked here as well as in the route,
  // because this function can post as the assistant and must never be callable
  // into a thread the caller has nothing to do with.
  if (!loaded.thread.participants.some((p) => p.actorId === requesterId)) {
    return { status: "not-found" };
  }

  // Consent belongs to the patient whose care this thread is about — not to
  // whoever asked. A clinician cannot consent on their behalf.
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, loaded.row.patientId),
    columns: { aiConsentAt: true },
  });
  if (!profile?.aiConsentAt) {
    return {
      status: "blocked",
      code: "no_consent",
      consentIsYours: loaded.row.patientId === requesterId,
    };
  }

  // First use invites the assistant. visibleFrom defaults to now, so it cannot
  // read anything said before it was brought in.
  const alreadyIn = loaded.thread.participants.some((p) => p.actorId === ASSISTANT_ACTOR_ID);
  if (!alreadyIn) {
    await addParticipant({
      threadId,
      actorId: ASSISTANT_ACTOR_ID,
      kind: "ai",
      role: PARTICIPANT_ROLE.assistant,
    });
  }

  const fresh = await loadThread(threadId);
  if (!fresh) return { status: "not-found" };

  const turn = await runAiTurn(fresh.thread, fresh.messages, {
    actorId: ASSISTANT_ACTOR_ID,
    complete,
    systemPrompt: threadAssistantPrompt(),
    model: process.env.AI_MODEL ?? "unknown",
    // Asked for explicitly, so answer — the mention-based group default would
    // decline a direct request that did not happen to name the assistant.
    shouldRespond: () => true,
  });

  if (turn.status === "skipped") return { status: "skipped", reason: turn.reason };

  const posted = await postMessage({
    threadId,
    actorId: ASSISTANT_ACTOR_ID,
    body: turn.body,
    kind: "ai",
    generatedByModel: turn.generatedBy.model,
    // No senderId: the assistant has no users row, by design.
    senderId: null,
  });
  if (!posted.ok) return { status: "skipped", reason: posted.reason };

  return { status: "posted", body: turn.body };
}
