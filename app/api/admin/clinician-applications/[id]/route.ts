export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { badRequest } from "@/lib/utils/api-response";
import { UUID_RE } from "@/lib/utils/validate";
import { approveApplication, declineApplication, reviewApplicationSchema } from "@/lib/domain/clinician-application";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  if (!UUID_RE.test(id)) return badRequest("Invalid application id");

  const parsed = reviewApplicationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid data");

  try {
    const result =
      parsed.data.decision === "approve"
        ? await approveApplication(id, guard.session.user.id)
        : await declineApplication(id, guard.session.user.id, parsed.data.note ?? null);

    if (!result.ok) return badRequest(result.error);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/admin/clinician-applications/id] PATCH failed:", err);
    return NextResponse.json(
      { success: false, error: "Could not save that decision — please try again" },
      { status: 500 }
    );
  }
}
