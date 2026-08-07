export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

// Public health check (fleet convention): 200 = app up AND database reachable.
// Deploy pipelines and box monitors curl this after every restart.
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/health] database unreachable:", err);
    return NextResponse.json({ ok: false, error: "database unreachable" }, { status: 503 });
  }
}
