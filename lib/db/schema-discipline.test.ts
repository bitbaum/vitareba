/**
 * Every foreign key into `users` must state what happens when that user is
 * deleted. Left unstated, Postgres defaults to NO ACTION, which silently makes
 * the row a veto: production could not erase a patient who had ever uploaded a
 * document, because documents.uploaded_by held a reference with no policy.
 * Erasure is a right the product offers (/api/account/deletion-request), so a
 * missing policy is a broken promise, not a style nit.
 *
 * Choosing one is a real decision, so it must be made explicitly:
 *   cascade  — the row IS the user's data and dies with them
 *   set null — the row outlives them; the reference was provenance
 *   (listed)  — deliberately retained; see RETAINED_AUTHORSHIP below
 */
/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SCHEMA = readFileSync(join(process.cwd(), "lib/db/schema.ts"), "utf8");

/**
 * Columns that intentionally have NO delete policy, so deleting the referenced
 * user FAILS LOUDLY instead of quietly rewriting a clinical record.
 *
 * These are authorship of clinical content: who wrote the note, who assigned
 * the programme, who set the goal. A medical record has to keep its author —
 * anonymising it on staff departure destroys traceability, and deleting the
 * content destroys the patient's history. The correct operation for a
 * departing clinician is to DEACTIVATE the account, not delete the row, and
 * this FK is what enforces that. None of these can be written by a patient,
 * so none of them can block a patient's own erasure.
 *
 * thread_messages.sender_id looks like it belongs here and does NOT: a patient
 * is a sender too, so leaving it policyless vetoed erasing the patient
 * themselves. Membership in this list requires that only staff can write the
 * column.
 */
const RETAINED_AUTHORSHIP = new Set([
  "admin_id",        // patient_notes — who recorded the clinical note
  "assigned_by",     // programme_assignments — who enrolled the patient
  "set_by_admin_id", // clinical_goals — who set the goal
]);

/** Every `.references(() => users.id …)` paired with its column name. */
function userForeignKeys(): { column: string; hasPolicy: boolean }[] {
  const out: { column: string; hasPolicy: boolean }[] = [];
  // Column name appears in the uuid("…") immediately preceding the reference.
  const re = /uuid\("([a-z_]+)"\)[\s\S]{0,120}?\.references\(\(\) => users\.id([^)]*)\)/g;
  for (const m of SCHEMA.matchAll(re)) {
    out.push({ column: m[1], hasPolicy: /onDelete/.test(m[2]) });
  }
  return out;
}

describe("user foreign-key delete policy", () => {
  const fks = userForeignKeys();

  it("finds the user foreign keys", () => {
    expect(fks.length).toBeGreaterThan(8);
  });

  it("every reference to users either states a policy or is listed as retained authorship", () => {
    const unstated = fks
      .filter((fk) => !fk.hasPolicy && !RETAINED_AUTHORSHIP.has(fk.column))
      .map((fk) => fk.column);
    expect(
      unstated,
      "add { onDelete: … } — or add the column to RETAINED_AUTHORSHIP with the reason"
    ).toEqual([]);
  });

  // The specific row that blocked erasure in production.
  it("documents.uploaded_by does not veto deleting a patient", () => {
    // Fixed window from the column declaration — a lazy match stops at the
    // first ")" inside `() => users.id` and reads as a false pass.
    const start = SCHEMA.indexOf('uuid("uploaded_by")');
    expect(start).toBeGreaterThan(-1);
    // Cut at the next top-level column so the neighbours' .notNull() calls
    // cannot be mistaken for this column's.
    const declaration = SCHEMA.slice(start).split(/\n {2}\w+:/)[0];
    expect(declaration).toContain('onDelete: "set null"');
    expect(declaration).not.toContain("notNull");
  });
});
