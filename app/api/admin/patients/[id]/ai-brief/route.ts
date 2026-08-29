export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { serviceUnavailable, badRequest } from "@/lib/utils/api-response";
import { UUID_RE } from "@/lib/utils/validate";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { aiChat, isAiConfigured, isAiDpaSigned } from "@/lib/ai";
import { compilePatientDigest, clinicianBriefPrompt } from "@/lib/domain/ai-brief";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * AI pre-consultation brief for one patient. HTTP 451 (Unavailable For Legal
 * Reasons) when the legal gate is closed — blockId points at the regulatory
 * ledger entry explaining which law, who passed it, and who benefits.
 */
export async function POST(_req: Request, { params }: RouteContext) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  if (!UUID_RE.test(id)) return badRequest("Invalid patient id");

  if (!isAiConfigured()) {
    return NextResponse.json(
      { success: false, code: "ai_not_configured", blockId: "cloud-ai-processing" },
      { status: 451 },
    );
  }

  // Explicit patient consent (GDPR Art. 9(2)(a) / revFADP) — the clinician's
  // wish to use AI does not override the patient's choice.
  let profile;
  try {
    profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, id),
      columns: { aiConsentAt: true },
    });
  } catch (err) {
    console.error("[api/ai-brief] consent lookup failed:", err);
    return serviceUnavailable();
  }
  if (!profile?.aiConsentAt) {
    return NextResponse.json(
      { success: false, code: "no_consent", blockId: "cloud-ai-processing" },
      { status: 451 },
    );
  }

  try {
    const digest = await compilePatientDigest(id, new Date());
    const prompt = clinicianBriefPrompt(digest);
    const result = await aiChat(prompt);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }
    return NextResponse.json({
      success: true,
      data: { brief: result.text, dpaWarning: !isAiDpaSigned() },
    });
  } catch (err) {
    console.error("[api/ai-brief] failed:", err);
    return serviceUnavailable();
  }
}
