export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { USER_ROLE } from "@/lib/config/auth";
import { DOCUMENT_TITLE_MAX_LENGTH, MIME_TYPE_MAX_LENGTH } from "@/lib/config/portal";
import { UUID_RE } from "@/lib/utils/validate";
import { runAfterResponse } from "@/lib/utils/post-response";
import { serviceUnavailable } from "@/lib/utils/api-response";
import { notifyDocumentAdded } from "@/lib/domain/document-notify";

const createSchema = z.object({
  userId: z.string().uuid(),
  title: z.string().min(1).max(DOCUMENT_TITLE_MAX_LENGTH),
  fileUrl: z.string().url(),
  mimeType: z.string().max(MIME_TYPE_MAX_LENGTH).optional(),
});

export async function GET(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");

  if (patientId && !UUID_RE.test(patientId)) {
    return NextResponse.json({ success: false, error: "Invalid patientId" }, { status: 400 });
  }

  try {
    // Admin with no patientId filter → return all documents with user info
    if (session.user.role === USER_ROLE.admin && !patientId) {
      const results = await db.query.documents.findMany({
        orderBy: [desc(documents.createdAt)],
        with: { user: { columns: { id: true, name: true, email: true } } },
      });
      return NextResponse.json({ success: true, data: results });
    }

    const targetId =
      session.user.role === USER_ROLE.admin && patientId ? patientId : session.user.id;

    const results = await db.query.documents.findMany({
      where: eq(documents.userId, targetId),
      orderBy: [desc(documents.createdAt)],
    });
    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    console.error("[api/documents] GET failed:", err);
    return serviceUnavailable();
  }
}

export async function POST(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
  }

  // Same ownership rule as /api/documents/upload: only an admin may name the
  // owner — everybody else files documents against their own record.
  const ownerId =
    session.user.role === USER_ROLE.admin ? parsed.data.userId : session.user.id;

  let doc: typeof documents.$inferSelect;
  try {
    [doc] = await db
      .insert(documents)
      .values({ ...parsed.data, userId: ownerId, uploadedBy: session.user.id })
      .returning();
  } catch (err) {
    console.error("[api/documents] insert failed:", err);
    return NextResponse.json({ success: false, error: "Failed to save document — please try again" }, { status: 500 });
  }

  // Schedule the notification after the response so the work is not dropped
  // when the request lifecycle ends.
  runAfterResponse(
    () => notifyDocumentAdded({ patientId: ownerId, uploaderId: session.user.id, title: parsed.data.title }),
    "[api/documents] notification failed:"
  );

  return NextResponse.json({ success: true, data: doc }, { status: 201 });
}
