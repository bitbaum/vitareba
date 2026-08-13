export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";
import { PROFILE_COMPLETION_THRESHOLD } from "@/lib/config/portal";
import { computeProfileCompleteness, profileUpdateSchema } from "@/lib/domain/profile";
import { profileCompletedAdminEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email";
import { PORTAL_URL, getAdminEmails } from "@/lib/config/company";
import { ADMIN_ROUTES } from "@/lib/config/routes";
import { runAfterResponse } from "@/lib/utils/post-response";
import { serviceUnavailable } from "@/lib/utils/api-response";
import { displayName } from "@/lib/utils/format";

export async function GET() {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  let profile: typeof profiles.$inferSelect | undefined;
  let userRow: { name: string | null; email: string; image: string | null; createdAt: Date } | undefined;
  try {
    [profile, userRow] = await Promise.all([
      db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) }),
      db.query.users.findFirst({
        where: eq(users.id, session.user.id),
        columns: { name: true, email: true, image: true, createdAt: true },
      }),
    ]);
  } catch (err) {
    console.error("[api/profile] GET failed:", err);
    return serviceUnavailable();
  }

  return NextResponse.json({
    success: true,
    data: {
      ...(profile ?? {}),
      name: userRow?.name ?? null,
      email: userRow?.email ?? null,
      image: userRow?.image ?? null,
      memberSince: userRow?.createdAt ?? null,
    },
  });
}

export async function PATCH(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  const body = await req.json();
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
  }

  const { name, aiConsent, ...profileFields } = parsed.data;
  // Explicit AI consent (GDPR Art. 9(2)(a)) — timestamped on grant, cleared on
  // withdrawal; both are the patient's act alone.
  const consentPatch =
    aiConsent === undefined ? {} : { aiConsentAt: aiConsent ? new Date() : null };

  let existing: typeof profiles.$inferSelect | undefined;
  let updated: typeof profiles.$inferSelect;
  try {
    // Parallel: update name (if provided) + fetch existing profile for threshold check
    [, existing] = await Promise.all([
      name ? db.update(users).set({ name }).where(eq(users.id, session.user.id)) : Promise.resolve(),
      db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) }),
    ]);

    // Upsert profile and return updated row in one query
    [updated] = await db
      .insert(profiles)
      .values({ userId: session.user.id, ...profileFields, ...consentPatch })
      .onConflictDoUpdate({ target: profiles.userId, set: { ...profileFields, ...consentPatch, updatedAt: new Date() } })
      .returning();
  } catch (err) {
    console.error("[api/profile] upsert failed:", err);
    return NextResponse.json({ success: false, error: "Failed to save profile — please try again" }, { status: 500 });
  }

  const oldPct = computeProfileCompleteness(existing as Record<string, unknown> | null);
  const newPct = computeProfileCompleteness(updated as Record<string, unknown> | null);
  const threshold = PROFILE_COMPLETION_THRESHOLD * 100;

  if (oldPct < threshold && newPct >= threshold) {
    const adminEmails = getAdminEmails();
    if (adminEmails.length > 0) {
      runAfterResponse(async () => {
        const patient = await db.query.users.findFirst({
          where: eq(users.id, session.user.id),
          columns: { name: true, email: true },
        });
        if (!patient) return;
        await sendEmail({
          to: adminEmails,
          subject: `Profile ready: ${displayName(patient.name, patient.email)}`,
          html: profileCompletedAdminEmail({
            patientName: displayName(patient.name, patient.email, ""),
            patientEmail: patient.email ?? "",
            completionPct: newPct,
            adminUrl: `${PORTAL_URL}${ADMIN_ROUTES.patients}/${session.user.id}`,
          }),
        });
      }, "[api/profile] profile completion email failed:");
    }
  }

  return NextResponse.json({ success: true });
}
