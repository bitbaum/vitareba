export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { serviceUnavailable } from "@/lib/utils/api-response";
import { getApplicationQueue } from "@/lib/domain/clinician-application";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  try {
    const rows = await getApplicationQueue();
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error("[api/admin/clinician-applications] GET failed:", err);
    return serviceUnavailable();
  }
}
