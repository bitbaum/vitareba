export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { badRequest } from "@/lib/utils/api-response";
import { UUID_RE } from "@/lib/utils/validate";
import { db } from "@/lib/db";
import { clinicalGoals } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { goalUpdateSchema } from "@/lib/domain/goals";

type RouteContext = { params: Promise<{ goalId: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { goalId } = await params;
  if (!UUID_RE.test(goalId)) return badRequest("Invalid goal id");

  const body = await req.json();
  const parsed = goalUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
  }

  const { completed, ...rest } = parsed.data;

  let updated: typeof clinicalGoals.$inferSelect | undefined;
  try {
    [updated] = await db
      .update(clinicalGoals)
      .set({
        ...rest,
        ...(completed !== undefined ? { completedAt: completed ? new Date() : null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(clinicalGoals.id, goalId))
      .returning();
  } catch (err) {
    console.error("[api/admin/goals] update failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to update goal — please try again" },
      { status: 500 },
    );
  }

  if (!updated) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { goalId } = await params;
  if (!UUID_RE.test(goalId)) return badRequest("Invalid goal id");

  try {
    await db.delete(clinicalGoals).where(eq(clinicalGoals.id, goalId));
  } catch (err) {
    console.error("[api/admin/goals] delete failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to delete goal — please try again" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
