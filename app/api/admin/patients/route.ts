export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { serviceUnavailable } from "@/lib/utils/api-response";
import { db } from "@/lib/db";
import { patientScope } from "@/lib/domain/patients";
import { assessmentResults, users } from "@/lib/db/schema";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  let patients;
  try {
    patients = await db.query.users.findMany({
      where: patientScope(),
      orderBy: [desc(users.createdAt)],
      with: {
        profile: true,
        assessmentResults: {
          orderBy: [desc(assessmentResults.completedAt)],
          limit: 1,
        },
      },
    });
  } catch (err) {
    console.error("[api/admin/patients] GET failed:", err);
    return serviceUnavailable();
  }

  return NextResponse.json({ success: true, data: patients });
}
