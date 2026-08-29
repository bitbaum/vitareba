/// <reference types="vitest/globals" />
/**
 * WHO TREATS THIS PATIENT — CI teeth for the one-source-of-truth rule.
 *
 * `care_team` is the only thing that knows which clinician treats a given
 * patient. Config used to answer it too (`COMPANY.clinicianName: "Manuel"`),
 * which meant every patient in the system was told the same doctor treats
 * them — false from the moment the clinic had a second clinician, and the exact
 * copy a new patient reads first.
 *
 * Deleting the property fixed the instances. This test ends the class:
 *
 *  1. No config object may re-introduce a `clinician*Name`-shaped key.
 *  2. No shared copy (emails, portal, marketing sections) may hardcode the name
 *     of a real clinician. The names are sourced from TEAM_MEMBERS so this stays
 *     SSOT — adding a doctor to the roster automatically protects their name.
 *
 * The marketing roster itself is the one legitimate place a clinician's name is
 * a literal: it is a public "who we are" list, not a claim about any patient.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { TEAM_MEMBERS } from "@/lib/config/team";

const ROOTS = ["app", "components", "lib"];

/**
 * Files where naming a clinician is the point, not a leak of patient-specific
 * truth. Keep this list short — every entry is a place the compiler can no
 * longer help.
 */
const NAME_ALLOWLIST = new Set([
  "lib/config/team.ts", // the marketing roster — the names' home
  "lib/domain/clinician-discipline.test.ts", // this file
]);

/**
 * Comments are where this rule gets EXPLAINED, so scanning them would make the
 * test fail on its own rationale. Strip them and scan the code that ships.
 * The `[^:]` guard keeps `https://` from being read as a line comment.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function collect(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry.startsWith(".")) return [];
    if (statSync(full).isDirectory()) return collect(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const FILES = ROOTS.flatMap(collect);

describe("clinician identity discipline", () => {
  it("has files to scan", () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it("keeps clinician names out of config", () => {
    // A config key shaped like `clinicianName` is the exact defect this test
    // exists for: it reads as an answer to "who is the doctor", and config
    // cannot know that.
    const offenders = FILES.filter((file) => file.startsWith(join("lib", "config"))).filter(
      (file) => /\bclinician(Full|Display|Primary)?Name\s*:/.test(readFileSync(file, "utf8")),
    );

    expect(
      offenders,
      "Config cannot answer 'who treats this patient' — resolve it with clinicianLabelFor(patientId) and fall back to COMPANY.clinicianFallback.",
    ).toEqual([]);
  });

  it("keeps real clinician names out of shared copy", () => {
    // Match on a word boundary so "Manuel" is caught but "manuel@..." in an
    // email address, or an unrelated word containing the name, is not.
    const names = TEAM_MEMBERS.map((member) => member.name);

    const offenders = FILES.filter(
      // Test fixtures name people on purpose — that is what a fixture is.
      (file) => !NAME_ALLOWLIST.has(file) && !/\.test\.tsx?$/.test(file),
    ).flatMap((file) => {
      const source = stripComments(readFileSync(file, "utf8"));
      return names
        .filter((name) =>
          new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`).test(source),
        )
        .map((name) => `${file}: "${name}"`);
    });

    expect(
      offenders,
      "A clinician's name in shared copy is a guess shown as a fact — resolve it with clinicianLabelFor(patientId).",
    ).toEqual([]);
  });
});
