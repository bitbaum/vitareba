import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { USER_ROLE } from "@/lib/config/auth";

export async function requireSession(): Promise<
  { session: Session; error: null } | { session: null; error: NextResponse }
> {
  const session = await auth();
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { session, error: null };
}

/**
 * Verifies the request carries a valid CRON_SECRET bearer token.
 * Returns a 401 NextResponse if the check fails, null if authorized.
 * Usage: const cronError = requireCron(req); if (cronError) return cronError;
 */
export function requireCron(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  // Reject if secret is not configured or header doesn't match
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function requireAdmin(): Promise<
  { session: Session; error: null } | { session: null; error: NextResponse }
> {
  const session = await auth();
  if (!session || session.user.role !== USER_ROLE.admin) {
    return {
      session: null,
      error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { session, error: null };
}

/**
 * Second occurrence of this exact check (first: api/clinician/accepting-patients)
 * — moved here instead of copied again, per the project's "notice on the 2nd,
 * extract by the 3rd" rule, since more clinician-only routes were already
 * planned. `isClinician` isn't on the session/JWT, so this is a DB read.
 */
export async function requireClinician(): Promise<
  | { session: Session; clinicianId: string; error: null }
  | { session: null; clinicianId: null; error: NextResponse }
> {
  const session = await auth();
  if (!session) {
    return {
      session: null,
      clinicianId: null,
      error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  const row = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { isClinician: true },
  });
  if (!row?.isClinician) {
    // Not "forbidden" — a plain patient account has no reason to learn that
    // this route exists at all.
    return {
      session: null,
      clinicianId: null,
      error: NextResponse.json({ success: false, error: "Not found" }, { status: 404 }),
    };
  }
  return { session, clinicianId: session.user.id, error: null };
}
