export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/guards";
import { serviceUnavailable } from "@/lib/utils/api-response";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { aiChat, isAiConfigured, isAiDpaSigned } from "@/lib/ai";
import { compilePatientDigest, patientInsightPrompt } from "@/lib/domain/ai-brief";

/**
 * AI trend reflection over the requesting patient's OWN data. HTTP 451 when
 * the legal gate is closed — blockId points at the regulatory ledger.
 */
export async function POST() {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  if (!isAiConfigured()) {
    return NextResponse.json(
      { success: false, code: "ai_not_configured", blockId: "cloud-ai-processing" },
      { status: 451 }
    );
  }

  let profile;
  try {
    profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
      columns: { aiConsentAt: true },
    });
  } catch (err) {
    console.error("[api/ai/insight] consent lookup failed:", err);
    return serviceUnavailable();
  }
  if (!profile?.aiConsentAt) {
    return NextResponse.json(
      { success: false, code: "no_consent", blockId: "cloud-ai-processing" },
      { status: 451 }
    );
  }

  try {
    const digest = await compilePatientDigest(session.user.id, new Date());
    const prompt = patientInsightPrompt(digest);
    const result = await aiChat(prompt);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }
    return NextResponse.json({ success: true, data: { insight: result.text, dpaWarning: !isAiDpaSigned() } });
  } catch (err) {
    console.error("[api/ai/insight] failed:", err);
    return serviceUnavailable();
  }
}
