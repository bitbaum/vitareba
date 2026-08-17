export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { listNotifications, getUnreadCount } from "@/lib/domain/notifications";

/** List + unread count in one response — the bell's poll target. */
export async function GET(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;

  const cursor = new URL(req.url).searchParams.get("cursor") ?? undefined;
  const [{ items, nextCursor }, unreadCount] = await Promise.all([
    listNotifications(guard.session.user.id, { cursor }),
    getUnreadCount(guard.session.user.id),
  ]);

  return NextResponse.json({ success: true, data: { items, nextCursor, unreadCount } });
}
