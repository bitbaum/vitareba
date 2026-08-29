export const dynamic = "force-dynamic";

/**
 * A clinician's own bio, title, specialties and working hours.
 *
 * SELF-SERVICE ONLY — same shape as api/clinician/accepting-patients: a
 * clinician edits their own settings, there is no admin override route. The
 * row is created lazily on first PATCH; a GET before that returns nulls
 * (bio/title/specialties) and the engine defaults (weeklyHours etc, from
 * DEFAULT_AVAILABILITY) so the UI can show "using default hours" honestly
 * instead of inventing values that were never actually set.
 */

import { NextResponse } from "next/server";
import { requireClinician } from "@/lib/auth/guards";
import { badRequest, serviceUnavailable } from "@/lib/utils/api-response";
import {
  clinicianProfileUpdateSchema,
  getClinicianProfile,
  updateClinicianProfile,
} from "@/lib/domain/clinician-profile";
import { DEFAULT_AVAILABILITY } from "@/lib/config/scheduling";

export async function GET() {
  const { error, clinicianId } = await requireClinician();
  if (error) return error;

  try {
    const row = await getClinicianProfile(clinicianId);
    return NextResponse.json({
      success: true,
      data: {
        bio: row?.bio ?? null,
        title: row?.title ?? null,
        specialties: row?.specialties ?? [],
        weeklyHours: row?.weeklyHours ?? DEFAULT_AVAILABILITY.weeklyHours,
        slotMinutes: row?.slotMinutes ?? DEFAULT_AVAILABILITY.slotMinutes,
        bufferMinutes: row?.bufferMinutes ?? DEFAULT_AVAILABILITY.bufferMinutes,
        leadTimeHours: row?.leadTimeHours ?? DEFAULT_AVAILABILITY.leadTimeHours,
        horizonDays: row?.horizonDays ?? DEFAULT_AVAILABILITY.horizonDays,
        maxPerDay: row?.maxPerDay ?? DEFAULT_AVAILABILITY.maxPerDay,
        // Lets the settings UI say "using the clinic default" vs "you set this".
        usingDefaults: row === null,
      },
    });
  } catch (err) {
    console.error("[api/clinician/profile] GET failed:", err);
    return serviceUnavailable();
  }
}

export async function PATCH(req: Request) {
  const { error, clinicianId } = await requireClinician();
  if (error) return error;

  const parsed = clinicianProfileUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid data");

  try {
    await updateClinicianProfile(clinicianId, parsed.data);
  } catch (err) {
    console.error("[api/clinician/profile] PATCH failed:", err);
    return NextResponse.json(
      { success: false, error: "Could not save — please try again" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
