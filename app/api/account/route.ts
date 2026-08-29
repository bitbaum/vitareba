export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, profiles } from "@/lib/db/schema";
import { registerSchema, hashPassword } from "@/lib/domain/auth";
import { enqueueWelcomeEmails } from "@/lib/domain/email-queue";
import { runAfterResponse } from "@/lib/utils/post-response";

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;

  let existing;
  try {
    existing = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
  } catch (err) {
    console.error("[api/account] email check failed:", err);
    return NextResponse.json(
      { success: false, error: "Registration failed — please try again" },
      { status: 500 },
    );
  }
  if (existing) {
    return NextResponse.json(
      { success: false, error: { email: ["Email already registered"] } },
      { status: 409 },
    );
  }

  const hashed = await hashPassword(password);

  let newUser: { id: string } | undefined;
  try {
    // onConflictDoNothing closes the check-then-insert race: two concurrent
    // POSTs with the same new email both pass the up-front findFirst, then
    // .returning() yields [] for whichever lost the unique-constraint race
    // — we surface that as the same 409 the up-front check returns, instead
    // of a misleading 500 from a raw constraint-violation throw.
    const inserted = await db
      .insert(users)
      .values({ email, password: hashed })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });
    if (inserted.length === 0) {
      return NextResponse.json(
        { success: false, error: { email: ["Email already registered"] } },
        { status: 409 },
      );
    }
    newUser = inserted[0];
    // Create empty profile row so profile-dependent features work immediately
    await db.insert(profiles).values({ userId: newUser.id });
  } catch (err) {
    console.error("[api/account] registration failed:", err);
    return NextResponse.json(
      { success: false, error: "Registration failed — please try again" },
      { status: 500 },
    );
  }

  runAfterResponse(
    () => enqueueWelcomeEmails({ userId: newUser.id, triggeredAt: new Date() }),
    "[email-queue] welcome enqueue failed:",
  );

  return NextResponse.json({ success: true }, { status: 201 });
}
