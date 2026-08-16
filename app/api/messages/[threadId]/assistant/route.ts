export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { isAiDpaSigned } from "@/lib/ai";
import { getThreadForActor } from "@/lib/domain/messages";
import { runThreadAssistant } from "@/lib/domain/thread-assistant";
import { serviceUnavailable, badRequest } from "@/lib/utils/api-response";
import { UUID_RE } from "@/lib/utils/validate";

/**
 * Ask the assistant to reply once in this thread.
 *
 * On demand only. A clinical conversation should not acquire a third voice
 * because a message happened to arrive — a participant has to ask, and that
 * request is also what invites the assistant the first time.
 *
 * HTTP 451 when the legal gate is closed, matching /api/ai/insight: blockId
 * points at the regulatory ledger so the UI can explain *why* rather than
 * showing a dead button.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const actorId = guard.session.user.id;

  const { threadId } = await params;
  if (!UUID_RE.test(threadId)) return badRequest("Invalid thread id");

  // Same answer for "no such thread" and "not your thread" as everywhere else
  // in this API — that a conversation exists is itself a disclosure.
  const visible = await getThreadForActor(threadId, actorId);
  if (!visible) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  let turn;
  try {
    turn = await runThreadAssistant(threadId, actorId);
  } catch (err) {
    console.error("[api/messages/assistant] failed:", err);
    return serviceUnavailable();
  }

  switch (turn.status) {
    case "blocked":
      return NextResponse.json(
        { success: false, code: turn.code, blockId: "cloud-ai-processing" },
        { status: 451 }
      );
    case "not-found":
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    case "skipped":
      // Not an error: the assistant declining is a normal outcome, and the
      // caller wants to log the reason rather than show a failure.
      return NextResponse.json({ success: true, data: { posted: false, reason: turn.reason } });
    case "posted":
      return NextResponse.json({
        success: true,
        data: { posted: true, dpaWarning: !isAiDpaSigned() },
      });
  }
}
