export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { USER_ROLE } from "@/lib/config/auth";
import { UUID_RE } from "@/lib/utils/validate";
import { badRequest, serviceUnavailable } from "@/lib/utils/api-response";
import { readLocal, isLocalUrl } from "@/lib/storage";

/** A document body is medical data. Nothing about it may be cached by a proxy,
 *  and it must never be sniffed into an executable type. */
const FILE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};

// A document that exists but belongs to someone else answers exactly like one
// that does not exist. A 403 would confirm the id is real, which is itself a
// disclosure about another patient.
const notFound = () => NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

/**
 * Stream a patient document to someone allowed to see it.
 *
 * This route exists because the files used to be served straight off disk by
 * the web server under /uploads/*, with no session involved: anyone holding
 * (or guessing) the URL could read a patient's medical records, forever, and
 * the URL leaks through browser history, referrers and forwarded emails.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  const { id } = await params;
  if (!UUID_RE.test(id)) return badRequest("Invalid document id");

  let doc;
  try {
    doc = await db.query.documents.findFirst({
      where: eq(documents.id, id),
      columns: { userId: true, title: true, fileUrl: true, mimeType: true },
    });
  } catch (err) {
    console.error("[api/documents/file] lookup failed:", err);
    return serviceUnavailable();
  }

  if (!doc) return notFound();

  // Same ownership rule as GET /api/documents: your own records, or an admin.
  const isOwner = doc.userId === session.user.id;
  const isAdmin = session.user.role === USER_ROLE.admin;
  if (!isOwner && !isAdmin) return notFound();

  // Documents attached as an external link are not ours to stream.
  if (!isLocalUrl(doc.fileUrl)) return NextResponse.redirect(doc.fileUrl);

  let body: Buffer;
  try {
    body = await readLocal(doc.fileUrl);
  } catch (err) {
    // The row survives its file (restore, manual cleanup). Say so plainly
    // rather than returning a broken download.
    console.error("[api/documents/file] read failed:", err);
    return NextResponse.json(
      { success: false, error: "File is no longer available" },
      { status: 410 },
    );
  }

  const filename = doc.fileUrl.split("/").pop() ?? "document";
  return new NextResponse(new Uint8Array(body), {
    headers: {
      ...FILE_HEADERS,
      "Content-Type": doc.mimeType || "application/octet-stream",
      "Content-Length": String(body.byteLength),
      // inline: a patient opening a lab PDF should see it, not download it.
      "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
    },
  });
}
