/**
 * A profile field that exists in the schema but in no form is a field nobody
 * can ever fill. It typechecks, it deploys, and it is simply never asked —
 * which is indistinguishable from the feature not existing.
 *
 * This is a repeat offender across this codebase's siblings: a field added to
 * the validation schema, forgotten in the form, and silently absent from every
 * save for months. Adding the field twice by hand is a fix; this test is the
 * end of the class.
 *
 * It deliberately checks the FORMS, not the API. The API spreads whatever the
 * schema parsed, so it can never drop a field — the forms are where fields go
 * missing, because each one restates the field list by hand.
 */
/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { profileUpdateSchema } from "./profile";

const FORMS = [
  "app/(portal)/profile/ProfileForm.tsx",
  "components/admin/AdminProfileEditForm.tsx",
];

/**
 * Schema keys that intentionally have no form input, each with the reason.
 * Adding a key here is a deliberate act; forgetting one is what this test stops.
 */
const NOT_A_FORM_FIELD: Record<string, string> = {
  // Consent is given by its own explicit control on the AI page, never as one
  // checkbox among twenty — that is what makes it explicit consent.
  aiConsent: "granted on the AI insight page, not in the profile form",
  // Set from the notification preferences, and never editable by an admin on
  // the patient's behalf.
  digestOptOut: "lives in notification preferences",
  reminderOptOut: "lives in notification preferences",
  // Free-text clinical notes an admin writes about a patient; the patient's own
  // form has no business exposing it.
  notes: "admin-only field, absent from the patient form by design",
};

const shapeKeys = Object.keys(profileUpdateSchema.shape);

describe("every profile schema field is reachable from a form", () => {
  it.each(FORMS)("%s asks for every field it should", (formPath) => {
    const source = readFileSync(join(process.cwd(), formPath), "utf8");
    const missing = shapeKeys.filter((key) => {
      if (key in NOT_A_FORM_FIELD) return false;
      // `notes` is admin-only; the patient form is allowed not to carry it.
      return !new RegExp(`\\b${key}\\b`).test(source);
    });
    expect(
      missing,
      `${formPath} never mentions ${missing.join(", ")} — the field would silently never be saved`
    ).toEqual([]);
  });

  it("only excuses fields with a stated reason", () => {
    for (const [key, reason] of Object.entries(NOT_A_FORM_FIELD)) {
      expect(shapeKeys, `${key} is excused but is not a schema field`).toContain(key);
      expect(reason.length, `${key} is excused with no reason`).toBeGreaterThan(10);
    }
  });
});
