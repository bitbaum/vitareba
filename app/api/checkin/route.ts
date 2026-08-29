export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq, and, desc, gte } from "drizzle-orm";
import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { dailyCheckins, users } from "@/lib/db/schema";
import {
  CHECKIN_HISTORY_DAYS,
  CHECKIN_FETCH_MAX_DAYS,
  CHECKIN_STREAK_MILESTONES,
} from "@/lib/config/portal";
import { formatDateISO, displayName } from "@/lib/utils/format";
import { clinicianLabelFor } from "@/lib/domain/clinician-label";
import { checkinSchema, computeStreak } from "@/lib/domain/checkin";
import { sendEmail } from "@/lib/email/index";
import { checkinStreakMilestoneEmail } from "@/lib/email/templates";
import { PORTAL_URL } from "@/lib/config/company";
import { runAfterResponse } from "@/lib/utils/post-response";
import { serviceUnavailable } from "@/lib/utils/api-response";

export async function GET(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get("days");
  const parsedDays = limitParam ? parseInt(limitParam, 10) : NaN;
  const days =
    !isNaN(parsedDays) && parsedDays > 0
      ? Math.min(parsedDays, CHECKIN_FETCH_MAX_DAYS)
      : CHECKIN_HISTORY_DAYS;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = formatDateISO(cutoff);

  // Fetch recent check-ins ordered ascending for chart rendering
  let allCheckins;
  try {
    allCheckins = await db.query.dailyCheckins.findMany({
      where: eq(dailyCheckins.userId, session.user.id),
      orderBy: [desc(dailyCheckins.date)],
      limit: days,
    });
  } catch (err) {
    console.error("[api/checkin] GET failed:", err);
    return serviceUnavailable();
  }

  // Today's check-in
  const today = formatDateISO(new Date());
  const todayCheckin = allCheckins.find((c) => c.date === today) ?? null;

  return NextResponse.json({
    success: true,
    data: {
      checkins: allCheckins.reverse(), // ascending for chart
      todayCheckin,
      cutoffDate: cutoffStr,
    },
  });
}

export async function POST(req: Request) {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const { session } = guard;

  const body = await req.json();
  const parsed = checkinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { date, ...metrics } = parsed.data;

  // Upsert: check existence then update or insert — all inside one try-catch
  try {
    const existing = await db.query.dailyCheckins.findFirst({
      where: and(eq(dailyCheckins.userId, session.user.id), eq(dailyCheckins.date, date)),
    });

    if (existing) {
      await db
        .update(dailyCheckins)
        .set(metrics)
        .where(and(eq(dailyCheckins.userId, session.user.id), eq(dailyCheckins.date, date)));
    } else {
      await db.insert(dailyCheckins).values({
        userId: session.user.id,
        date,
        ...metrics,
      });

      runAfterResponse(
        () => detectAndSendStreakMilestone(session.user.id),
        "[api/checkin] streak milestone check failed:",
      );
    }
  } catch (err) {
    console.error("[api/checkin] save failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to save check-in — please try again" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}

// ─── Streak milestone helper ──────────────────────────────────────────────────

async function detectAndSendStreakMilestone(userId: string): Promise<void> {
  const now = new Date();
  // Fetch enough history to detect any milestone streak.
  // Max milestone is 100 days — we need 101+ days of data so computeStreak
  // can actually return 100 (a 60-day window would cap it at 60).
  const maxMilestone = Math.max(...CHECKIN_STREAK_MILESTONES);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - (maxMilestone + 1));

  const recentCheckins = await db.query.dailyCheckins.findMany({
    where: and(eq(dailyCheckins.userId, userId), gte(dailyCheckins.date, formatDateISO(cutoff))),
    orderBy: [desc(dailyCheckins.date)],
  });

  const streak = computeStreak(recentCheckins);
  if (!(CHECKIN_STREAK_MILESTONES as readonly number[]).includes(streak)) return;

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { name: true, email: true },
  });
  if (!user?.email) return;

  await sendEmail({
    to: user.email,
    subject: `🔥 ${streak}-day streak — you're building something real`,
    html: checkinStreakMilestoneEmail({
      patientName: displayName(user.name, user.email),
      streak,
      portalUrl: PORTAL_URL,
      clinician: await clinicianLabelFor(userId),
    }),
  });
}
