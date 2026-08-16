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
    // A DEFINITIVE NEGATIVE and an INABILITY TO ANSWER are not the same fault,
    // and must not produce the same status.
    //
    // Tables genuinely unusable → the app is broken → 503, above.
    // The check itself throwing → the app is serving fine and its diagnostic is
    // the broken part. Returning 503 here takes a healthy application offline in
    // every monitor and blocks every future deploy on a bug in the watchman.
    // That is exactly what happened the first time this shipped: a malformed
    // parameter binding turned a working site into a red pipeline.
    //
    // So: stay 200, say plainly in the body that the check did not run, and log
    // it. A degradation that is visible is not a degradation that is hidden.
    console.error("[api/health] schema check failed to run:", err);
    return NextResponse.json({ ok: true, schemaCheck: "failed" });
  }

  return NextResponse.json({ ok: true, schemaCheck: "passed" });
}
