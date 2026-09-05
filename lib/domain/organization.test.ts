/// <reference types="vitest/globals" />
/**
 * Seed-vs-constant discipline — CI teeth for the one SSOT that is a copy.
 *
 * `lib/config/company.ts` and the seed row in drizzle/00xx are deliberately two
 * expressions of the same facts, because build-time surfaces render with no
 * database (see organization.ts). Two expressions of one fact is exactly the
 * arrangement that rots, and this codebase already has one instance of it that
 * rotted for thirteen days: `--muted` was darkened for WCAG AA on 2026-04-15
 * and `COLOR_MUTED` in lib/config/theme.ts only caught up on 2026-04-28, so
 * every OG image, manifest and email shipped the contrast-failing grey in
 * between. That file still says "update both manually" and still has no test.
 *
 * This one does. No database needed: the seed is read out of the migration.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BOOTSTRAP_ORGANIZATION } from "@/lib/domain/organization";

const MIGRATIONS_DIR = "drizzle";

/** The migration that seeds the practice row, found by content, not by number. */
function seedMigration(): string {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const matches = files.filter((f) =>
    readFileSync(join(MIGRATIONS_DIR, f), "utf8").includes('INSERT INTO "organizations"'),
  );
  expect(matches, "exactly one migration may seed the practice row").toHaveLength(1);
  return readFileSync(join(MIGRATIONS_DIR, matches[0]), "utf8");
}

/**
 * Pull the seeded column→value pairs out of the INSERT.
 *
 * Line comments are stripped first: a scanner that counts quotes without
 * skipping `--` reads an apostrophe in prose as a string opening and silently
 * desyncs for the rest of the file.
 */
function seededValues(sql: string): Record<string, string | number | null> {
  const code = sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

  // Terminates on the statement's own semicolon, NOT on ON CONFLICT: keying the
  // parser to the idempotency clause meant deleting that clause stopped the file
  // parsing at all, and vitest reported "no tests" rather than a named failure.
  // A gate whose breakage looks like silence is not a gate.
  const stmt =
    /INSERT INTO "organizations"\s*\(([^)]*)\)\s*VALUES\s*\(([\s\S]*?)\)\s*(?:ON CONFLICT[^;]*)?;/.exec(
      code,
    );
  expect(stmt, "seed INSERT not found or not in the expected shape").not.toBeNull();

  const columns = stmt![1]
    .split(",")
    .map((c) => c.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);

  const values: (string | number | null)[] = [];
  // Quoted content and bare tokens are collected separately, so the whitespace
  // and newlines that pretty-print this INSERT never end up inside a value.
  // Quotedness also has to survive: '8008' is the postcode, not the number 8008,
  // and a zip that loses its quoting loses any leading zero — most of Europe.
  let str = "";
  let bare = "";
  let inString = false;
  let quoted = false;
  const flush = () => {
    values.push(quoted ? str : literal(bare));
    str = "";
    bare = "";
    quoted = false;
  };
  for (let i = 0; i < stmt![2].length; i++) {
    const ch = stmt![2][i];
    if (inString) {
      if (ch === "'") {
        // '' is an escaped quote inside a SQL string, not a terminator.
        if (stmt![2][i + 1] === "'") {
          str += "'";
          i++;
        } else inString = false;
      } else str += ch;
      continue;
    }
    if (ch === "'") {
      inString = true;
      quoted = true;
    } else if (ch === ",") flush();
    else bare += ch;
  }
  flush();

  expect(values, "every column must have exactly one value").toHaveLength(columns.length);
  return Object.fromEntries(columns.map((c, i) => [c, values[i]]));
}

/** An unquoted token is NULL or a number — quoted content never reaches here. */
function literal(raw: string): string | number | null {
  const t = raw.trim();
  if (/^NULL$/i.test(t)) return null;
  if (/^-?\d+$/.test(t)) return Number(t);
  return t;
}

describe("practice seed matches lib/config/company.ts", () => {
  const seeded = seededValues(seedMigration());

  const expected: Record<string, string | number | null> = {
    slug: BOOTSTRAP_ORGANIZATION.slug,
    name: BOOTSTRAP_ORGANIZATION.name,
    short_name: BOOTSTRAP_ORGANIZATION.shortName,
    clinician_fallback: BOOTSTRAP_ORGANIZATION.clinicianFallback,
    assistant_name: BOOTSTRAP_ORGANIZATION.assistantName,
    partner_brand: BOOTSTRAP_ORGANIZATION.partnerBrand,
    email: BOOTSTRAP_ORGANIZATION.email,
    phone: BOOTSTRAP_ORGANIZATION.phone,
    address_street: BOOTSTRAP_ORGANIZATION.addressStreet,
    address_zip: BOOTSTRAP_ORGANIZATION.addressZip,
    address_city: BOOTSTRAP_ORGANIZATION.addressCity,
    timezone: BOOTSTRAP_ORGANIZATION.timezone,
    founding_year: BOOTSTRAP_ORGANIZATION.foundingYear,
  };

  it("seeds every field the bootstrap identity declares", () => {
    expect(Object.keys(seeded).sort()).toEqual(Object.keys(expected).sort());
  });

  for (const [column, want] of Object.entries(expected)) {
    it(`${column} agrees`, () => {
      expect(seeded[column]).toEqual(want);
    });
  }

  it("is idempotent — apply-schema.sh replays migrations on every deploy", () => {
    expect(seedMigration()).toMatch(/ON CONFLICT\s*\("slug"\)\s*DO NOTHING/);
  });
});
