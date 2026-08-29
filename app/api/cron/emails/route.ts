export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { runCronEmails } from "@/lib/workflows/cron-emails";

export async function GET(req: Request) {
  const cronError = requireCron(req);
  if (cronError) return cronError;

  const result = await runCronEmails();
  if (!result.success) {
    // Report the cause the workflow actually returned. Hardcoding one of the
    // two made an email-configuration failure read as a database failure, and
    // the operator chased Postgres while the sender address was the problem.
    return NextResponse.json({ success: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json(result);
}
