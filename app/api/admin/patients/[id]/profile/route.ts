export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { badRequest } from "@/lib/utils/api-response";
import { UUID_RE } from "@/lib/utils/validate";
import { db } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { profileUpdateSchema } from "@/lib/domain/profile";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  if (!UUID_RE.test(id)) return badRequest("Invalid patient id");

  const body = await req.json();
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
  }

  const { name, ...profileFields } = parsed.data;

  try {
    await Promise.all([
      name != null ? db.update(users).set({ name }).where(eq(users.id, id)) : Promise.resolve(),
      db
        .insert(profiles)
        .values({ userId: id, ...profileFields })
        .onConflictDoUpdate({
          target: profiles.userId,
          set: { ...profileFields, updatedAt: new Date() },
        }),
    ]);
  } catch (err) {
    console.error("[api/admin/profile] upsert failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to save profile — please try again" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
