export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { getAvailableSlots, getClinicians } from "@/lib/domain/scheduling-data";
import { serviceUnavailable } from "@/lib/utils/api-response";

/**
 * Bookable appointment slots for one clinician (ISO instants, ascending),
 * plus the clinician roster so the picker can offer a choice.
 * ?clinicianId=… selects the doctor; defaults to the first one.
 */
export async function GET(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;

  try {
    const clinicians = await getClinicians();
    if (clinicians.length === 0) {
      return NextResponse.json({ success: true, data: [], clinicians: [], clinicianId: null });
    }

    const requested = new URL(req.url).searchParams.get("clinicianId");
    const clinician = clinicians.find((c) => c.id === requested) ?? clinicians[0];
    const slots = await getAvailableSlots(new Date(), clinician);

    return NextResponse.json({
      success: true,
      data: slots.map((s) => s.toISOString()),
      // Roster is name+id only — emails stay server-side
      clinicians: clinicians.map((c) => ({ id: c.id, name: c.name ?? "Clinician" })),
      clinicianId: clinician.id,
    });
  } catch (err) {
    console.error("[api/bookings/slots] failed:", err);
    return serviceUnavailable();
  }
}
