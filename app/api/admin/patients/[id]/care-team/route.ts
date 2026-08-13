export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { serviceUnavailable, badRequest } from "@/lib/utils/api-response";
import { UUID_RE } from "@/lib/utils/validate";
import { db } from "@/lib/db";
import { careTeam, users } from "@/lib/db/schema";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({ clinicianId: z.string().uuid() });

/** Add a clinician to this patient's care team. */
export async function POST(req: Request, { params }: RouteContext) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  if (!UUID_RE.test(id)) return badRequest("Invalid patient id");

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return badRequest("Invalid data");
  const { clinicianId } = parsed.data;
  if (clinicianId === id) return badRequest("A clinician cannot treat themselves");

  try {
    const clinician = await db.query.users.findFirst({
      where: and(eq(users.id, clinicianId), eq(users.isClinician, true)),
      columns: { id: true },
    });
    if (!clinician) return badRequest("Unknown clinician");

    await db
      .insert(careTeam)
      .values({ clinicianId, patientId: id })
      .onConflictDoNothing();
  } catch (err) {
    console.error("[api/admin/care-team] POST failed:", err);
    return serviceUnavailable();
  }

  return NextResponse.json({ success: true });
}

/** Remove a clinician from this patient's care team. */
export async function DELETE(req: Request, { params }: RouteContext) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  if (!UUID_RE.test(id)) return badRequest("Invalid patient id");

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return badRequest("Invalid data");

  try {
    await db
      .delete(careTeam)
      .where(and(eq(careTeam.patientId, id), eq(careTeam.clinicianId, parsed.data.clinicianId)));
  } catch (err) {
    console.error("[api/admin/care-team] DELETE failed:", err);
    return serviceUnavailable();
  }

  return NextResponse.json({ success: true });
}
