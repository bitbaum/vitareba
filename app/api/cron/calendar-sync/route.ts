export const dynamic = "force-dynamic";

/**
 * Refresh every subscribed clinician calendar.
 *
 * Runs on a timer rather than on demand because slot generation must never wait
 * on a third-party host: a calendar provider that is slow makes the picker slow,
 * and one that is down would make the clinic look completely free.
 *
 * The response names which feeds failed. A calendar that has been broken for a
 * week is a clinician being offered to patients during their own meetings, and
 * the only thing worse than that is not knowing.
 */

import { NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { syncAllCalendars } from "@/lib/domain/calendar-sync";

export async function GET(req: Request) {
  const cronError = requireCron(req);
  if (cronError) return cronError;

  try {
    const result = await syncAllCalendars();
    return NextResponse.json({
      success: true,
      synced: result.synced,
      failed: result.failed,
      // Labels and reasons only — never the secret URLs.
      failures: result.outcomes
        .filter((o) => !o.ok)
        .map((o) => ({ label: o.label, error: o.error })),
    });
  } catch (err) {
    console.error("[cron/calendar-sync] failed:", err);
    return NextResponse.json({ success: false, error: "Calendar sync failed" }, { status: 500 });
  }
}
