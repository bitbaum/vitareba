/**
 * The tables this application actually needs, derived from the schema itself.
 *
 * Derived, not listed: a hand-maintained list of table names is a second source
 * of truth that goes stale the moment someone adds a table — which is exactly
 * the moment the check that uses it matters most.
 */

import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

export function appTableNames(): string[] {
  const names: string[] = [];
  // The schema module exports tables, enums and relations side by side, so the
  // narrowing runs against `unknown` — a type predicate cannot apply to that
  // union directly.
  for (const value of Object.values(schema) as unknown[]) {
    if (is(value, PgTable)) names.push(getTableName(value));
  }
  return names.sort();
}
