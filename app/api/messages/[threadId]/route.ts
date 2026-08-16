export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import {
  getThreadForActor,
  markThreadRead,
  postMessage,
  replySchema,
} from "@/lib/domain/messages";
import { serializeThread } from "@/lib/domain/messages-view";
import { notifyThreadParticipants } from "@/lib/domain/message-notifications";
import { runAfterResponse } from "@/lib/utils/post-response";
import { serviceUnavailable, badRequest } from "@/lib/utils/api-response";
import { UUID_RE } from "@/lib/utils/validate";

/**
 * A thread you are not in is answered exactly like one that does not exist.
 * A 403 would confirm the thread is real — and, on a clinical system, that a
 * particular conversation exists is itself a disclosure.
 */
const notFound = () =>
  NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const actorId = guard.session.user.id;

  const { threadId } = await params;
  if (!UUID_RE.test(threadId)) return badRequest("Invalid thread id");

  let payload;
  try {
    const loaded = await getThreadForActor(threadId, actorId);
    if (!loaded) return notFound();
    payload = await serializeThread(loaded.thread, loaded.messages, actorId, loaded.row);
  } catch (err) {
    console.error("[api/messages/threadId] GET failed:", err);
    return serviceUnavailable();
  }

  // Moves only this participant's own mark — never anyone else's.
  runAfterResponse(
    () => markThreadRead(threadId, actorId),
    "[api/messages/threadId] mark-read failed:"
  );

  return NextResponse.json({ success: true, data: payload });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const actorId = guard.session.user.id;

  const { threadId } = await params;
  if (!UUID_RE.test(threadId)) return badRequest("Invalid thread id");

  const parsed = replySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid message body" }, { status: 400 });
  }

  let result;
  try {
    result = await postMessage({
      threadId,
      actorId,
      body: parsed.data.body,
      senderId: actorId,
    });
  } catch (err) {
    console.error("[api/messages/threadId] send failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to send message — please try again" },
      { status: 500 }
    );
  }

  // "No such thread" and "you may not write here" answer the same way, for the
  // same reason the read path does.
  if (!result.ok) return notFound();

  runAfterResponse(
    () => notifyThreadParticipants(threadId, actorId),
    "[api/messages/threadId] notification failed:"
  );

  return NextResponse.json({ success: true, data: result.message }, { status: 201 });
}
