export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { serviceUnavailable, badRequest } from "@/lib/utils/api-response";
import { UUID_RE } from "@/lib/utils/validate";
import { PATIENT_NOTE_MAX_LENGTH } from "@/lib/config/portal";
import { db } from "@/lib/db";
import { patientNotes, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  if (!UUID_RE.test(id)) return badRequest("Invalid patient id");

  let notes;
  try {
    notes = await db.query.patientNotes.findMany({
      where: eq(patientNotes.patientId, id),
      orderBy: [desc(patientNotes.createdAt)],
      with: { admin: { columns: { name: true } } },
    });
  } catch (err) {
    console.error("[api/admin/notes] GET failed:", err);
    return serviceUnavailable();
  }

  return NextResponse.json({ success: true, data: notes });
}

const createSchema = z.object({
  body: z.string().min(1).max(PATIENT_NOTE_MAX_LENGTH),
});

export async function POST(req: Request, { params }: RouteContext) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { session } = guard;

  const { id } = await params;
  if (!UUID_RE.test(id)) return badRequest("Invalid patient id");

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
  }

  let note: typeof patientNotes.$inferSelect;
  try {
    [note] = await db
      .insert(patientNotes)
      .values({
        patientId: id,
        adminId: session.user.id,
        body: parsed.data.body,
      })
      .returning();
  } catch (err) {
    console.error("[api/admin/notes] insert failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to save note — please try again" },
      { status: 500 },
    );
  }

  const admin = await db.query.users
    .findFirst({
      where: eq(users.id, session.user.id),
      columns: { name: true },
    })
    .catch(() => null);

  return NextResponse.json(
    { success: true, data: { ...note, admin: { name: admin?.name ?? null } } },
    { status: 201 },
  );
}
