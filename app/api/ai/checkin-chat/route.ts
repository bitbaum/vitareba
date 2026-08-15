export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/guards";
import { serviceUnavailable } from "@/lib/utils/api-response";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { aiChat, isAiConfigured, isAiDpaSigned } from "@/lib/ai";
import { compilePatientDigest, checkinCompanionSystem } from "@/lib/domain/ai-brief";
import { clinicianLabelFor } from "@/lib/domain/clinician-label";
import { CHECKIN_CHAT_MAX_TURNS, CHECKIN_CHAT_MESSAGE_MAX_LENGTH } from "@/lib/config/portal";

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(CHECKIN_CHAT_MESSAGE_MAX_LENGTH),
      })
    )
    .min(1)
    .max(CHECKIN_CHAT_MAX_TURNS),
});

/**
 * The conversation a patient can have about their OWN check-in data, right
 * after logging it. Same legal gate as every other AI surface: HTTP 451 with a
 * blockId into the regulatory ledger when no provider is connected or the
 * patient has not consented to cloud processing of health data.
 *
 * Stateless by design — the client sends the turns, nothing is persisted. A
 * patient's half-formed thoughts about their own mood are not a clinical
 * record, and storing them would put them in the erasure and export paths for
 * no clinical gain.
 */
export async function POST(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  if (!isAiConfigured()) {
    return NextResponse.json(
      { success: false, code: "ai_not_configured", blockId: "cloud-ai-processing" },
      { status: 451 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
  }

  const parsed = chatSchema.safeParse(body);
  // The last turn must be the patient's — otherwise there is nothing to answer.
  if (!parsed.success || parsed.data.messages[parsed.data.messages.length - 1].role !== "user") {
    return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
  }

  let profile;
  try {
    profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
      columns: { aiConsentAt: true },
    });
  } catch (err) {
    console.error("[api/ai/checkin-chat] consent lookup failed:", err);
    return serviceUnavailable();
  }
  if (!profile?.aiConsentAt) {
    return NextResponse.json(
      { success: false, code: "no_consent", blockId: "cloud-ai-processing" },
      { status: 451 }
    );
  }

  try {
    const [digest, clinicianLabel] = await Promise.all([
      compilePatientDigest(session.user.id, new Date()),
      clinicianLabelFor(session.user.id),
    ]);
    const result = await aiChat({
      system: checkinCompanionSystem(digest, clinicianLabel),
      history: parsed.data.messages,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }
    return NextResponse.json({
      success: true,
      data: { reply: result.text, dpaWarning: !isAiDpaSigned() },
    });
  } catch (err) {
    console.error("[api/ai/checkin-chat] failed:", err);
    return serviceUnavailable();
  }
}
