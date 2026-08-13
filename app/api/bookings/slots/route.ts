export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { getAvailableSlots } from "@/lib/domain/scheduling-data";
import { serviceUnavailable } from "@/lib/utils/api-response";

/** Bookable appointment slots (ISO instants), ascending. */
export async function GET() {
  const guard = await requireSession();
  if (guard.error) return guard.error;

  try {
    const slots = await getAvailableSlots(new Date());
    return NextResponse.json({ success: true, data: slots.map((s) => s.toISOString()) });
  } catch (err) {
    console.error("[api/bookings/slots] failed:", err);
    return serviceUnavailable();
  }
}
