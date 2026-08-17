export const dynamic = "force-dynamic";

/**
 * A patient's own "apply to become a clinician" request. Submitting does not
 * grant anything by itself — see app/api/admin/clinician-applications for the
 * approve/decline side.
 */

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { badRequest, serviceUnavailable } from "@/lib/utils/api-response";
import { getOwnLatestApplication, submitApplication, submitApplicationSchema } from "@/lib/domain/clinician-application";

export async function GET() {
  const guard = await requireSession();
  if (guard.error) return guard.error;

  try {
    const application = await getOwnLatestApplication(guard.session.user.id);
    return NextResponse.json({ success: true, data: application });
  } catch (err) {
    console.error("[api/clinician-applications] GET failed:", err);
    return serviceUnavailable();
  }
}

export async function POST(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;

  const parsed = submitApplicationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Tell us a little about why you'd like to join as a clinician.");

  try {
    const result = await submitApplication(guard.session.user.id, parsed.data.message);
    if (!result.ok) return badRequest(result.error);
    return NextResponse.json({ success: true, data: { id: result.id } }, { status: 201 });
  } catch (err) {
    console.error("[api/clinician-applications] POST failed:", err);
    return NextResponse.json(
      { success: false, error: "Could not submit your application — please try again" },
      { status: 500 }
    );
  }
}
