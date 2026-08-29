/**
 * The privilege check is only as good as the list of tables it checks, and that
 * list is derived from what the schema module EXPORTS. A table defined but not
 * exported would be invisible to it — the check would pass while the one table
 * nobody can read stays broken.
 *
 * So this test compares the derived list against the schema source itself. It
 * is the "gate the closed side" case: it is easy to assert the tables we know
 * about are present, and useless, because the failure is a table we do not know
 * about.
 */
/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appTableNames } from "./tables";

const SCHEMA_SOURCE = readFileSync(join(process.cwd(), "lib/db/schema.ts"), "utf8");

/** Every table name that appears in a pgTable(...) call in the schema file. */
const declared = [...SCHEMA_SOURCE.matchAll(/pgTable\(\s*"([a-z_]+)"/g)].map((m) => m[1]).sort();

describe("derived table list", () => {
  it("finds tables at all", () => {
    // A regex that silently matches nothing would make every assertion below
    // vacuously true, which is the classic way this kind of test lies.
    expect(declared.length).toBeGreaterThan(10);
    expect(appTableNames().length).toBeGreaterThan(10);
  });

  it("covers every table the schema declares", () => {
    const derived = appTableNames();
    const missing = declared.filter((name) => !derived.includes(name));
    expect(
      missing,
      `declared in schema.ts but not exported, so no check can see them: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("claims no table the schema does not declare", () => {
    const extra = appTableNames().filter((name) => !declared.includes(name));
    expect(extra, `derived but not declared: ${extra.join(", ")}`).toEqual([]);
  });

  it("has no duplicates and is stably ordered", () => {
    const names = appTableNames();
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([...names].sort());
  });
});
