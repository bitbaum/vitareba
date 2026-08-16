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

  // PORTAL_URL, never the request's own URL.
  //
  // This app sits behind Caddy, which proxies to 127.0.0.1:4011 — so `req.url`
  // is the INTERNAL address, and `new URL(req.url).origin` handed every
  // clinician a subscription link to https://localhost:4011. Pasted into Google
  // or Apple Calendar it resolves to nothing, on their machine, silently. The
  // old `|| PORTAL_URL` fallback never fired, because "https://localhost:4011"
  // is a perfectly non-empty string.
  //
  // Deliberately NOT X-Forwarded-Host either: that is attacker-controlled input,
  // and this link carries a calendar token. PORTAL_URL is configured, is already
  // the SSOT for every link in every email, and cannot be set by a request.
  return NextResponse.json({
    success: true,
    data: { url: `${PORTAL_URL}/api/calendar/${id}/${token}.ics` },
  });
}
