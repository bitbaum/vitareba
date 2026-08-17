export const dynamic = "force-dynamic";

/**
 * What a patient may see about a clinician — the profile behind the Care
 * Team card. Never leadTimeHours/horizonDays/maxPerDay: those are booking-
 * engine tuning, not identity, and not this route's business to expose.
 *
 * Any signed-in patient may look up any clinician by id — the roster itself
 * (lib/domain/care-team.ts getClinicianRoster) is already visible to every
 * patient, so this adds no new disclosure, only detail on a name they can
 * already see.
 */

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { serviceUnavailable } from "@/lib/utils/api-response";
import { UUID_RE } from "@/lib/utils/validate";
import { getPublicClinicianProfile } from "@/lib/domain/clinician-profile";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const guard = await requireSession();
  if (guard.error) return guard.error;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  try {
    const profile = await getPublicClinicianProfile(id);
    if (!profile) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: profile });
  } catch (err) {
    console.error("[api/clinicians/[id]] GET failed:", err);
    return serviceUnavailable();
  }
}
