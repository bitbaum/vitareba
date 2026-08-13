export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/guards";
import { serviceUnavailable } from "@/lib/utils/api-response";
import { db } from "@/lib/db";
import {
  users,
  profiles,
  dailyCheckins,
  assessmentResults,
  bookings,
  clinicalGoals,
  documents,
  threads,
  threadMessages,
} from "@/lib/db/schema";
import { COMPANY } from "@/lib/config/company";

/**
 * Right of access / data portability (GDPR Art. 15 & 20, revFADP Art. 25):
 * everything the portal stores about the requesting user, as one JSON file.
 * Self-service — no ticket, no waiting period.
 */
export async function GET() {
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const uid = guard.session.user.id;

  try {
    const [user, profile, checkins, assessments, myBookings, goals, docs, myThreads] =
      await Promise.all([
        db.query.users.findFirst({
          where: eq(users.id, uid),
          columns: { id: true, name: true, email: true, role: true, isClinician: true, createdAt: true },
        }),
        db.query.profiles.findFirst({ where: eq(profiles.userId, uid) }),
        db.query.dailyCheckins.findMany({
          where: eq(dailyCheckins.userId, uid),
          orderBy: [asc(dailyCheckins.date)],
        }),
        db.query.assessmentResults.findMany({
          where: eq(assessmentResults.userId, uid),
          orderBy: [desc(assessmentResults.completedAt)],
        }),
        db.query.bookings.findMany({
          where: eq(bookings.userId, uid),
          orderBy: [desc(bookings.createdAt)],
        }),
        db.query.clinicalGoals.findMany({ where: eq(clinicalGoals.patientId, uid) }),
        db.query.documents.findMany({
          where: eq(documents.userId, uid),
          columns: { id: true, title: true, fileUrl: true, mimeType: true, createdAt: true },
        }),
        db.query.threads.findMany({
          where: eq(threads.patientId, uid),
          with: { messages: { orderBy: [asc(threadMessages.createdAt)] } },
        }),
      ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: COMPANY.name,
      legalBasis: "GDPR Art. 15/20; Swiss revFADP Art. 25 (right of access)",
      account: user,
      profile,
      dailyCheckins: checkins,
      assessments,
      bookings: myBookings,
      clinicalGoals: goals,
      documents: docs,
      messageThreads: myThreads,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="vitareba-data-export.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[api/account/export] failed:", err);
    return serviceUnavailable();
  }
}
