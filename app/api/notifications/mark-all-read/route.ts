export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { markAllRead } from "@/lib/domain/notifications";

export async function PATCH() {
  const guard = await requireSession();
  if (guard.error) return guard.error;

  await markAllRead(guard.session.user.id);
  return NextResponse.json({ success: true });
}
