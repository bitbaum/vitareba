export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { serviceUnavailable, badRequest } from "@/lib/utils/api-response";
import { UUID_RE } from "@/lib/utils/validate";
import { db } from "@/lib/db";
import { clinicalGoals } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { goalCreateSchema } from "@/lib/domain/goals";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  if (!UUID_RE.test(id)) return badRequest("Invalid patient id");

  let goals;
  try {
    goals = await db.query.clinicalGoals.findMany({
      where: eq(clinicalGoals.patientId, id),
      orderBy: [asc(clinicalGoals.createdAt)],
    });
  } catch (err) {
    console.error("[api/admin/goals] GET failed:", err);
    return serviceUnavailable();
  }

  return NextResponse.json({ success: true, data: goals });
}

export async function POST(req: Request, { params }: RouteContext) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { session } = guard;

  const { id } = await params;
  if (!UUID_RE.test(id)) return badRequest("Invalid patient id");

  const body = await req.json();
  const parsed = goalCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
  }

  let goal: typeof clinicalGoals.$inferSelect;
  try {
    [goal] = await db
      .insert(clinicalGoals)
      .values({
        patientId: id,
        setByAdminId: session.user.id,
        title: parsed.data.title,
        metric: parsed.data.metric ?? null,
        baseline: parsed.data.baseline ?? null,
        target: parsed.data.target ?? null,
        current: parsed.data.current ?? null,
        notes: parsed.data.notes ?? null,
      })
      .returning();
  } catch (err) {
    console.error("[api/admin/goals] insert failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to create goal — please try again" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, data: goal }, { status: 201 });
}
