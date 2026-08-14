export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { getAvailableSlots, getClinicians } from "@/lib/domain/scheduling-data";
import { getCareTeamIds } from "@/lib/domain/care-team";
import { getAvailabilityForEmail } from "@/lib/config/scheduling";
import { serviceUnavailable } from "@/lib/utils/api-response";

/**
 * Bookable appointment slots for one clinician (ISO instants, ascending),
 * plus everything the picker needs to explain the choice: the roster, which
 * of them already treat this patient, and how long an appointment runs.
 *
 * ?clinicianId=… selects the doctor. The default is the patient's OWN
 * clinician — landing on a stranger's calendar is the wrong first offer when
 * somebody already treats you.
 */
export async function GET(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;

  try {
    const [clinicians, careTeam] = await Promise.all([
      getClinicians(),
      getCareTeamIds(guard.session.user.id),
    ]);

    if (clinicians.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        clinicians: [],
        clinicianId: null,
        careTeam: [],
      });
    }

    const requested = new URL(req.url).searchParams.get("clinicianId");
    const mine = clinicians.find((c) => careTeam.includes(c.id));
    const clinician = clinicians.find((c) => c.id === requested) ?? mine ?? clinicians[0];
    const slots = await getAvailableSlots(new Date(), clinician);

    return NextResponse.json({
      success: true,
      data: slots.map((s) => s.toISOString()),
      // Roster is name+id only — emails stay server-side
      clinicians: clinicians.map((c) => ({ id: c.id, name: c.name ?? "Clinician" })),
      clinicianId: clinician.id,
      careTeam,
      slotMinutes: getAvailabilityForEmail(clinician.email).slotMinutes,
    });
  } catch (err) {
    console.error("[api/bookings/slots] failed:", err);
    return serviceUnavailable();
  }
}
