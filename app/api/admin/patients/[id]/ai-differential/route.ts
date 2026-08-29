export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { serviceUnavailable, badRequest } from "@/lib/utils/api-response";
import { UUID_RE } from "@/lib/utils/validate";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { aiChat, isAiConfigured, isAiDpaSigned } from "@/lib/ai";
import { compilePatientDigest, differentialPrompt } from "@/lib/domain/ai-brief";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Differential discussion aid — the feature MDR would call a medical device
 * if it claimed to diagnose. It doesn't: it surfaces hypotheses with
 * for/against evidence for a qualified clinician to judge, runs only with
 * patient consent, and every response carries `deviceWarning: true` which the
 * UI MUST render (house rule: works, but warned — see /regulation#ai-diagnosis).
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

  let profile;
  try {
    profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, id),
      columns: { aiConsentAt: true },
    });
  } catch (err) {
    console.error("[api/ai-differential] consent lookup failed:", err);
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
    const prompt = differentialPrompt(digest);
    const result = await aiChat({ ...prompt, maxTokens: 1200 });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }
    return NextResponse.json({
      success: true,
      data: {
        differential: result.text,
        deviceWarning: true,
        dpaWarning: !isAiDpaSigned(),
      },
    });
  } catch (err) {
    console.error("[api/ai-differential] failed:", err);
    return serviceUnavailable();
  }
}
