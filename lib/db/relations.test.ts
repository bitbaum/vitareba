/// <reference types="vitest/globals" />
/**
 * Drizzle relation integrity — regression net.
 *
 * Relation misconfiguration throws at QUERY-BUILD time, not at schema
 * definition time, so tsc and every mocked route test stay green while prod
 * 500s. It has now happened twice:
 *  - a missing reverse relation ("not enough information to infer relation")
 *    silently killed every DB-touching cron
 *  - an ambiguous documents↔users pair without relationName 500'd the admin
 *    patient-detail page
 *
 * Building the SQL (`.toSQL()`) runs the same normalizeRelation path a real
 * query does — no database needed. This file plans a query for EVERY declared
 * relation of EVERY table, so any future relation added without its reverse
 * side or relationName fails here, in CI, instead of in prod.
 */
import { describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Never connects — query building is purely local.
const db = drizzle(new Pool({ connectionString: "postgresql://x:x@localhost:1/x" }), {
  schema,
});

// Drizzle's internal relational config: table key → { relations: {...} }
const tablesConfig = (db as unknown as {
  _: { schema: Record<string, { relations: Record<string, unknown> }> };
})._.schema;

describe("drizzle relation integrity", () => {
  const tables = Object.entries(tablesConfig);

  it("finds tables with relations (sanity)", () => {
    expect(tables.length).toBeGreaterThan(10);
  });

  for (const [tableName, config] of tables) {
    const relationNames = Object.keys(config.relations);
    if (relationNames.length === 0) continue;

    it(`${tableName}: all relations (${relationNames.join(", ")}) can be planned`, () => {
      const withAll = Object.fromEntries(relationNames.map((r) => [r, true as const]));
      const query = (
        db.query as unknown as Record<
          string,
          { findFirst: (opts: { with: Record<string, true> }) => { toSQL(): unknown } }
        >
      )[tableName].findFirst({ with: withAll });
      expect(() => query.toSQL()).not.toThrow();
    });
  }
});
