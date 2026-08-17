export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { serviceUnavailable, badRequest } from "@/lib/utils/api-response";
import { listClinicians, grantClinicianByEmail, grantClinicianSchema } from "@/lib/domain/clinicians";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  try {
    const rows = await listClinicians();
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error("[api/admin/clinicians] GET failed:", err);
    return serviceUnavailable();
  }
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const parsed = grantClinicianSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Enter a valid email address.");

  try {
    const result = await grantClinicianByEmail(parsed.data.email, guard.session.user.id);
    if (!result.ok) return badRequest(result.error);
    return NextResponse.json({ success: true, data: { id: result.id } }, { status: 201 });
  } catch (err) {
    console.error("[api/admin/clinicians] POST failed:", err);
    return NextResponse.json(
      { success: false, error: "Could not add that clinician — please try again" },
      { status: 500 }
    );
  }
}
