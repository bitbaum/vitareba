export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { calendarToken } from "@/lib/domain/calendar-token";
import { PORTAL_URL } from "@/lib/config/company";
import { serviceUnavailable } from "@/lib/utils/api-response";

/**
 * The clinician's own calendar-subscription URL.
 *
 * The token is an HMAC that only the server can compute, so the URL cannot be
 * assembled client-side — this route is the one place it becomes visible, and
 * only to the clinician it belongs to.
 */
export async function GET(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;

  const id = guard.session.user.id;

  try {
    const me = await db.query.users.findFirst({
      where: eq(users.id, id),
      columns: { isClinician: true },
    });
    if (!me?.isClinician) {
      return NextResponse.json({ success: true, data: { url: null } });
    }
  } catch (err) {
    console.error("[api/calendar/subscribe] lookup failed:", err);
    return serviceUnavailable();
  }

  let token: string;
  try {
    token = calendarToken(id);
  } catch {
    // No AUTH_SECRET configured → say so rather than hand out a broken link.
    return NextResponse.json({ success: true, data: { url: null } });
  }

  const origin = new URL(req.url).origin || PORTAL_URL;

  return NextResponse.json({
    success: true,
    data: { url: `${origin}/api/calendar/${id}/${token}.ics` },
  });
}
