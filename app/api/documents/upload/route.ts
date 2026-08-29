export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { putLocal } from "@/lib/storage";
import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { DOCUMENT_TITLE_MAX_LENGTH, DOCUMENT_MAX_FILE_SIZE_MB } from "@/lib/config/portal";
import { USER_ROLE } from "@/lib/config/auth";
import { UUID_RE } from "@/lib/utils/validate";
import { runAfterResponse } from "@/lib/utils/post-response";
import { notifyDocumentAdded } from "@/lib/domain/document-notify";

const MAX_BYTES = DOCUMENT_MAX_FILE_SIZE_MB * 1024 * 1024;

// Server-side MIME type allowlist — must stay in sync with DocumentAddForm's accept attribute
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain", // some browsers report CSV as text/plain
]);

export async function POST(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const title = formData.get("title") as string | null;

  // Ownership is decided server-side, never by the client: an admin may upload
  // for any patient, everybody else can only ever upload for themselves.
  const isAdmin = session.user.role === USER_ROLE.admin;
  const patientId = isAdmin ? (formData.get("patientId") as string | null) : session.user.id;

  if (!file || !title?.trim() || !patientId) {
    return NextResponse.json(
      { success: false, error: "file, title, and patientId required" },
      { status: 400 },
    );
  }

  if (!UUID_RE.test(patientId)) {
    return NextResponse.json({ success: false, error: "Invalid patientId" }, { status: 400 });
  }

  if (title.trim().length > DOCUMENT_TITLE_MAX_LENGTH) {
    return NextResponse.json(
      { success: false, error: `Title must be ${DOCUMENT_TITLE_MAX_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { success: false, error: `File exceeds ${DOCUMENT_MAX_FILE_SIZE_MB} MB limit` },
      { status: 413 },
    );
  }

  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ success: false, error: "File type not allowed" }, { status: 415 });
  }

  // Sanitize filename — no path traversal, keep extension
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, "_");
  const blobPath = `documents/${patientId}/${Date.now()}_${safeName}`;

  let blob: { url: string };
  try {
    blob = await putLocal(blobPath, file);
  } catch (err) {
    console.error("[api/documents/upload] blob upload failed:", err);
    return NextResponse.json(
      { success: false, error: "File upload failed — please try again" },
      { status: 500 },
    );
  }

  let doc: typeof documents.$inferSelect;
  try {
    [doc] = await db
      .insert(documents)
      .values({
        userId: patientId,
        uploadedBy: session.user.id,
        title: title.trim(),
        fileUrl: blob.url,
        mimeType: file.type || null,
      })
      .returning();
  } catch (err) {
    console.error("[api/documents/upload] db insert failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to save document record — please try again" },
      { status: 500 },
    );
  }

  const trimmedTitle = title.trim();

  // Schedule the notification after the response so the work is not dropped
  // when the request lifecycle ends. Who gets told depends on who uploaded —
  // see lib/domain/document-notify.ts.
  runAfterResponse(
    () => notifyDocumentAdded({ patientId, uploaderId: session.user.id, title: trimmedTitle }),
    "[api/documents/upload] notification failed:",
  );

  return NextResponse.json({ success: true, data: doc }, { status: 201 });
}
