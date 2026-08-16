/**
 * Compiles the health check's statement through Drizzle's own PostgreSQL dialect
 * and inspects what the driver will actually send.
 *
 * This test exists because the first version of this query was verified by hand
 * in psql — where it was valid — and shipped broken. Drizzle expands an
 * interpolated JS array into a comma-separated PARAMETER LIST, so what reached
 * Postgres was `unnest(($1,$2,…)::text[])`: a record cast to an array, rejected
 * with 42846. A working site reported unhealthy.
 *
 * There is no database in CI, so "run it and see" is not available. Compiling
 * the statement is, and it catches precisely the class of bug that a
 * hand-written equivalent cannot: a difference between the SQL you wrote and the
 * SQL your client sends.
 */
/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { unusableTablesQuery } from "./schema-usable";
import { appTableNames } from "./tables";

const dialect = new PgDialect();
const compile = (names: readonly string[]) => dialect.sqlToQuery(unusableTablesQuery(names));

describe("the statement the driver actually sends", () => {
  it("binds each table name as its own parameter", () => {
    // The privilege checks bind first, so the names occupy the tail. What
    // matters is that each name is a separate bound value and none is spliced
    // into the SQL text.
    const names = ["users", "profiles", "measurements"];
    const { params } = compile(names);
    expect(params.slice(-names.length)).toEqual(names);
  });

  it("builds a real array, never a record cast to one", () => {
    // The exact defect: `unnest(($9, $10)::text[])` is a record cast, and
    // Postgres refuses it with 42846. It must be an array constructor.
    const { sql: text } = compile(["users", "profiles"]);
    const normalised = text.replace(/\s+/g, " ");
    expect(normalised).toMatch(/unnest\(array\[\$\d+, \$\d+\]::text\[\]\)/);
    expect(normalised, "array expanded as a record").not.toMatch(/unnest\(\s*\(\s*\$\d+/);
  });

  it("scales the array to however many tables there are", () => {
    const real = appTableNames();
    const { sql: text, params } = compile(real);
    expect(params.slice(-real.length)).toEqual(real);
    // Every name gets a placeholder; the highest one is the last table.
    expect(text).toContain(`$${params.length}]::text[]`);
  });

  it("checks every privilege the application needs", () => {
    const { sql: text, params } = compile(["users"]);
    for (const verb of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      expect(params, `${verb} is never checked`).toContain(verb);
    }
    expect(text).toContain("has_table_privilege");
  });

  it("tests for a missing table before asking about its privileges", () => {
    // has_table_privilege raises on a table that does not exist rather than
    // answering false, so this ordering is load-bearing, not stylistic.
    const { sql: text } = compile(["users"]);
    expect(text.indexOf("to_regclass")).toBeLessThan(text.indexOf("has_table_privilege"));
  });

  it("never interpolates a table name into the SQL text", () => {
    const { sql: text } = compile(["users", "profiles"]);
    expect(text).not.toContain("users");
    expect(text).not.toContain("profiles");
  });
});
