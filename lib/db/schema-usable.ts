/**
 * CAN THIS APPLICATION ACTUALLY USE ITS OWN DATABASE?
 *
 * `select 1` answers "is the database reachable", which is not the same
 * question and has now twice reported health while the application was broken.
 *
 * The failure both times: migrations are applied to the box by the `postgres`
 * superuser, so a table created by a migration is OWNED by `postgres`. The
 * application connects as its own role, which is granted nothing on a table it
 * does not own. The table exists, the connection works, every query against it
 * fails with "permission denied", and nothing in CI can see it — CI has its own
 * database where the test user owns everything.
 *
 * `ALTER DEFAULT PRIVILEGES` on the box now grants automatically for tables
 * created in future. This check is the belt to that braces: it asserts the
 * property directly, against the real database, and it runs on every deploy
 * because the health endpoint is what the deploy pipeline waits for.
 *
 * It costs one catalogue query and reads no patient data.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { appTableNames } from "@/lib/db/tables";

/** Verbs the application performs. Missing any one of them breaks a real page. */
const REQUIRED_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;

export type SchemaProblem = { table: string; problem: string };

/**
 * Returns every table the application cannot fully use, with the reason.
 * An empty array means the schema is usable.
 *
 * Throws only if the database itself is unreachable — the caller already has a
 * distinct answer for that case and should not have it disguised as a
 * permission problem.
 */
/**
 * The statement, built but not run — so a test can compile it through Drizzle's
 * own dialect and inspect what the driver will actually send.
 *
 * That separation exists because of how the first version of this failed. The
 * SQL was verified by hand in psql, where it was perfectly valid, and shipped.
 * Through Drizzle it was not the same statement: interpolating a JS array
 * expands to a comma-separated parameter LIST, so `unnest(${names}::text[])`
 * reached Postgres as `unnest(($1,$2,…)::text[])` — a record cast to an array,
 * rejected outright. Health went red on a working site.
 *
 * A hand-written equivalent is not a test of the query the client sends.
 */
export function unusableTablesQuery(names: readonly string[]) {
  // CASE evaluates its branches in order, so the missing-table check always runs
  // before any privilege check — asking has_table_privilege about a table that
  // does not exist raises rather than answering false.
  const privilegeChecks = REQUIRED_PRIVILEGES.map(
    (verb) =>
      sql`when not has_table_privilege(current_user, 'public.' || quote_ident(n), ${verb}) then ${`no ${verb.toLowerCase()} privilege`}`,
  );

  // Each name is its own bound parameter inside a real array constructor.
  const nameArray = sql.join(
    names.map((n) => sql`${n}`),
    sql`, `,
  );

  return sql`
    select n,
      case
        when to_regclass('public.' || quote_ident(n)) is null then 'table missing'
        ${sql.join(privilegeChecks, sql` `)}
        else null
      end as problem
    from unnest(array[${nameArray}]::text[]) as n
  `;
}

export async function findUnusableTables(): Promise<SchemaProblem[]> {
  const names = appTableNames();
  if (names.length === 0) return [];

  const result = await db.execute<{ n: string; problem: string | null }>(
    unusableTablesQuery(names),
  );

  // node-postgres hands back a QueryResult; some drivers hand back the rows.
  // Accept either rather than depend on which one is wired up today.
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
  return (rows as { n: string; problem: string | null }[])
    .filter((r) => r.problem !== null)
    .map((r) => ({ table: r.n, problem: r.problem as string }));
}
