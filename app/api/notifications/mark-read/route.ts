export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guards";
import { markRead } from "@/lib/domain/notifications";

const bodySchema = z.object({ id: z.string().uuid() });

export async function PATCH(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  await markRead(guard.session.user.id, parsed.data.id);
  return NextResponse.json({ success: true });
}
