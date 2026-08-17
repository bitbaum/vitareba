export const dynamic = "force-dynamic";

/**
 * "I've looked at this list" — clears one of the admin nav's seen-at gated
 * badges. Generic across keys rather than a 4th near-identical route file
 * (bookings/goals/patients/applications is the rule-of-three trigger,
 * applied to routes): ?key=patients|applications. Bookings keeps its own
 * dedicated route (app/api/admin/bookings/mark-seen) — first of its kind,
 * not worth migrating for its own sake.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";

const SEEN_AT_COLUMN = {
  patients: "patientsSeenAt",
  applications: "applicationsSeenAt",
} as const;

type SeenKey = keyof typeof SEEN_AT_COLUMN;

function isSeenKey(value: string | null): value is SeenKey {
  return value === "patients" || value === "applications";
}

export async function PATCH(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const key = new URL(req.url).searchParams.get("key");
  if (!isSeenKey(key)) {
    return NextResponse.json({ success: false, error: "Invalid key" }, { status: 400 });
  }

  const now = new Date();
  const column = SEEN_AT_COLUMN[key];
  try {
    await db
      .insert(profiles)
      .values({ userId: guard.session.user.id, [column]: now })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: { [column]: now, updatedAt: now },
      });
  } catch (err) {
    console.error("[api/admin/nav/mark-seen] failed:", err);
    // Non-critical: the badge staying lit one refresh longer is a nuisance,
    // not a failure worth surfacing to the admin.
  }

  return NextResponse.json({ success: true });
}
