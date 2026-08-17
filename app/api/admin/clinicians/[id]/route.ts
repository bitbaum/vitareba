export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { badRequest } from "@/lib/utils/api-response";
import { UUID_RE } from "@/lib/utils/validate";
import { revokeClinicianStatus } from "@/lib/domain/clinicians";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  if (!UUID_RE.test(id)) return badRequest("Invalid id");

  try {
    const result = await revokeClinicianStatus(id);
    if (!result.ok) return badRequest(result.error);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/admin/clinicians/id] DELETE failed:", err);
    return NextResponse.json(
      { success: false, error: "Could not remove that clinician — please try again" },
      { status: 500 }
    );
  }
}
