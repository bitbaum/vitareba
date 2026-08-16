export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { findUnusableTables } from "@/lib/db/schema-usable";

/**
 * Public health check (fleet convention): 200 = the app is up AND can actually
 * use its database.
 *
 * "Can actually use" is deliberately stronger than "can connect". A migration
 * applied by the superuser creates a table the application's own role has no
 * rights on: the connection succeeds, `select 1` succeeds, health reports 200,
 * and every page touching that table returns 500. That has happened twice here,
 * and both times the pipeline was green while the product was broken.
 *
 * The response body never names a table. A public endpoint that enumerates the
 * schema is a free map of the system for anyone who asks; the detail goes to the
 * logs, where the person fixing it is already looking.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
  } catch (err) {
    console.error("[api/health] database unreachable:", err);
    return NextResponse.json({ ok: false, error: "database unreachable" }, { status: 503 });
  }

  try {
    const problems = await findUnusableTables();
    if (problems.length > 0) {
      console.error(
        "[api/health] schema not usable by the application role:",
        problems.map((p) => `${p.table}: ${p.problem}`).join(", ")
      );
      return NextResponse.json({ ok: false, error: "schema not usable" }, { status: 503 });
    }
  } catch (err) {
    // The privilege check itself failing must not be reported as a healthy app,
    // but it is a different fault from a table being unreachable — say so.
    console.error("[api/health] schema check failed:", err);
    return NextResponse.json({ ok: false, error: "schema check failed" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
