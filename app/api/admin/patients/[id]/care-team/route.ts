export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { serviceUnavailable, badRequest } from "@/lib/utils/api-response";
import { UUID_RE } from "@/lib/utils/validate";
import { addCareTeamMember, removeCareTeamMember } from "@/lib/domain/care-team";

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

  try {
    const result = await addCareTeamMember(parsed.data.clinicianId, id);
    if (!result.ok) return badRequest(result.error);
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
    await removeCareTeamMember(parsed.data.clinicianId, id);
  } catch (err) {
    console.error("[api/admin/care-team] DELETE failed:", err);
    return serviceUnavailable();
  }

  return NextResponse.json({ success: true });
}
