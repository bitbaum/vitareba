export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guards";
import { badRequest, serviceUnavailable } from "@/lib/utils/api-response";
import {
  addCareTeamMember,
  canPatientChooseClinician,
  getCareTeamIds,
  getClinicianRoster,
  removeCareTeamMember,
} from "@/lib/domain/care-team";

const bodySchema = z.object({ clinicianId: z.string().uuid() });

/** The clinician roster + who currently treats ME. */
export async function GET() {
  const guard = await requireSession();
  if (guard.error) return guard.error;

  try {
    const [clinicians, mine] = await Promise.all([
      getClinicianRoster(),
      getCareTeamIds(guard.session.user.id),
    ]);
    return NextResponse.json({ success: true, data: { clinicians, mine } });
  } catch (err) {
    console.error("[api/care-team] GET failed:", err);
    return serviceUnavailable();
  }
}

/** Patients choose their own clinician — no admin round-trip required. */
export async function POST(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return badRequest("Invalid data");

  try {
    // Closed intake is enforced HERE, at the moment of choosing — never by
    // hiding the clinician from the roster (an existing patient must still be
    // able to find their own doctor in the same list).
    const eligible = await canPatientChooseClinician(guard.session.user.id, parsed.data.clinicianId);
    if (!eligible.ok) return badRequest(eligible.error);

    const result = await addCareTeamMember(parsed.data.clinicianId, guard.session.user.id);
    if (!result.ok) return badRequest(result.error);
  } catch (err) {
    console.error("[api/care-team] POST failed:", err);
    return serviceUnavailable();
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return badRequest("Invalid data");

  try {
    await removeCareTeamMember(parsed.data.clinicianId, guard.session.user.id);
  } catch (err) {
    console.error("[api/care-team] DELETE failed:", err);
    return serviceUnavailable();
  }

  return NextResponse.json({ success: true });
}
