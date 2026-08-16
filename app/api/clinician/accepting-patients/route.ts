export const dynamic = "force-dynamic";

/**
 * Whether the signed-in clinician is currently taking on new patients.
 *
 * SELF-SERVICE ONLY. A clinician sets their own status — there is no admin
 * override route, and no other clinician can flip it for them. That is the
 * whole feature: "the doctor decides", not "the clinic decides for the
 * doctor". An admin who is also a clinician (this practice's usual case) sets
 * their own the same way everyone else does.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { badRequest, serviceUnavailable } from "@/lib/utils/api-response";
import { isAcceptingPatients, setAcceptingPatients } from "@/lib/domain/care-team";

const bodySchema = z.object({ accepting: z.boolean() });

async function requireClinician() {
  const guard = await requireSession();
  if (guard.error) return { error: guard.error, clinicianId: null };

  const row = await db.query.users.findFirst({
    where: eq(users.id, guard.session.user.id),
    columns: { isClinician: true },
  });
  if (!row?.isClinician) {
    // Not "forbidden" — a plain patient account has no reason to learn that
    // this setting exists at all.
    return {
      error: NextResponse.json({ success: false, error: "Not found" }, { status: 404 }),
      clinicianId: null,
    };
  }
  return { error: null, clinicianId: guard.session.user.id };
}

export async function GET() {
  const { error, clinicianId } = await requireClinician();
  if (error) return error;

  try {
    const accepting = await isAcceptingPatients(clinicianId);
    return NextResponse.json({ success: true, data: { accepting } });
  } catch (err) {
    console.error("[api/clinician/accepting-patients] GET failed:", err);
    return serviceUnavailable();
  }
}

export async function PATCH(req: Request) {
  const { error, clinicianId } = await requireClinician();
  if (error) return error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid data");

  try {
    await setAcceptingPatients(clinicianId, parsed.data.accepting);
  } catch (err) {
    console.error("[api/clinician/accepting-patients] PATCH failed:", err);
    return NextResponse.json(
      { success: false, error: "Could not save — please try again" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
