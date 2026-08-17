export const dynamic = "force-dynamic";

/**
 * "I've looked at the bookings list" — clears the admin nav's new-bookings
 * badge. Same shape as the goals page's goalsSeenAt: an upsert, because the
 * profile row may not exist yet for an admin who has never touched one.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";

export async function PATCH() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const now = new Date();
  try {
    await db
      .insert(profiles)
      .values({ userId: guard.session.user.id, bookingsSeenAt: now })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: { bookingsSeenAt: now, updatedAt: now },
      });
  } catch (err) {
    console.error("[api/admin/bookings/mark-seen] failed:", err);
    // Non-critical: the badge staying lit one refresh longer is a nuisance,
    // not a failure worth surfacing to the admin.
  }

  return NextResponse.json({ success: true });
}
