export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { assessmentResults } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { enqueueAssessmentEmails } from "@/lib/domain/email-queue";
import { assessmentSaveSchema } from "@/lib/domain/assessment";
import { runAfterResponse } from "@/lib/utils/post-response";
import { serviceUnavailable } from "@/lib/utils/api-response";

export async function POST(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  const body = await req.json();
  const parsed = assessmentSaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
  }

  // Detect retake before inserting so we know whether to send the full nurture sequence
  let priorCount = 0;
  try {
    const prior = await db.query.assessmentResults.findFirst({
      where: eq(assessmentResults.userId, session.user.id),
      columns: { id: true },
    });
    priorCount = prior ? 1 : 0;
  } catch {
    // Non-fatal: if the check fails, default to first-assessment behaviour (safe)
  }

  let result: typeof assessmentResults.$inferSelect;
  try {
    [result] = await db
      .insert(assessmentResults)
      .values({
        userId: session.user.id,
        scores: parsed.data.scores,
        overallScore: parsed.data.overallScore,
      })
      .returning();
  } catch (err) {
    console.error("[api/assessment] insert failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to save assessment — please try again" },
      { status: 500 },
    );
  }

  runAfterResponse(
    () =>
      enqueueAssessmentEmails({
        userId: session.user.id,
        overallScore: parsed.data.overallScore,
        scores: parsed.data.scores,
        triggeredAt: result.completedAt,
        isFirstAssessment: priorCount === 0,
      }),
    "[email-queue] enqueue failed:",
  );

  return NextResponse.json({ success: true, data: result }, { status: 201 });
}

export async function GET() {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  let results;
  try {
    results = await db.query.assessmentResults.findMany({
      where: eq(assessmentResults.userId, session.user.id),
      orderBy: [desc(assessmentResults.completedAt)],
    });
  } catch (err) {
    console.error("[api/assessment] GET failed:", err);
    return serviceUnavailable();
  }

  return NextResponse.json({ success: true, data: results });
}
