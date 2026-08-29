export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/guards";
import { serviceUnavailable } from "@/lib/utils/api-response";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "@/lib/config/auth";
import {
  hashPassword,
  verifyPassword,
  isUserLocked,
  nextLoginAttemptState,
} from "@/lib/domain/auth";

const schema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

export async function POST(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
  }

  const { currentPassword, newPassword } = parsed.data;

  let user;
  try {
    user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { password: true, failedLoginAttempts: true, lockedUntil: true },
    });
  } catch (err) {
    console.error("[api/auth/change-password] user lookup failed:", err);
    return serviceUnavailable();
  }

  // No password set means OAuth-only account — can't change what doesn't exist
  if (!user?.password) {
    return NextResponse.json(
      { success: false, error: "No password set on this account" },
      { status: 400 },
    );
  }

  // Apply the same brute-force lockout that gates /login. Without this, an
  // attacker with session access (XSS, stolen cookie) could enumerate the
  // current password against this endpoint forever and use it for credential
  // stuffing on other sites — even though they already have session access.
  if (isUserLocked(user)) {
    return NextResponse.json(
      { success: false, error: "Too many attempts — please try again later" },
      { status: 429 },
    );
  }

  const valid = await verifyPassword(currentPassword, user.password);

  if (!valid) {
    // Record the failed attempt; trigger lockout after threshold
    const nextState = nextLoginAttemptState(user, false);
    await db.update(users).set(nextState).where(eq(users.id, session.user.id));
    return NextResponse.json(
      { success: false, error: "Current password is incorrect" },
      { status: 401 },
    );
  }

  const hashed = await hashPassword(newPassword);
  try {
    // Also clear the brute-force lockout state — successfully changing a
    // password proves the user knows it, so any prior failed-attempt streak
    // shouldn't follow them into the next sign-in.
    await db
      .update(users)
      .set({ password: hashed, failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(users.id, session.user.id));
  } catch (err) {
    console.error("[api/auth/change-password] update failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to update password — please try again" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
