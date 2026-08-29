export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { assessmentLeads } from "@/lib/db/schema";

const convertSchema = z.object({
  leadId: z.string().uuid(),
});

// Marks an anonymous assessment lead as converted — called by PendingAssessmentSaver
// when a visitor registers and saves their pending assessment.
export async function POST(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = convertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
  }

  try {
    await db
      .update(assessmentLeads)
      .set({ convertedUserId: session.user.id, convertedAt: new Date() })
      .where(
        and(
          eq(assessmentLeads.id, parsed.data.leadId),
          isNull(assessmentLeads.convertedUserId), // idempotent — skip if already attributed
        ),
      );
  } catch (err) {
    console.error("[api/assessment-leads/convert] update failed:", err);
    // Non-critical — don't fail the overall registration flow
  }

  return NextResponse.json({ success: true });
}
