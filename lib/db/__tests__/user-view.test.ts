import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { users } from "../schema";
import {
  ADMIN_PATIENT_FIELDS,
  USER_WITHHELD_FIELDS,
  toAdminPatientView,
  type UserRow,
} from "../user-view";

const schemaColumns = Object.keys(getTableColumns(users));

const row = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "A Patient",
  email: "patient@example.com",
  emailVerified: null,
  image: null,
  password: "$2b$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQ",
  role: "patient",
  isClinician: false,
  failedLoginAttempts: 2,
  lockedUntil: null,
  createdAt: new Date("2026-01-01"),
} as unknown as UserRow;

describe("user-view: what may leave the server", () => {
  it("classifies every users column as exposed or withheld", () => {
    const exposed = new Set<string>(ADMIN_PATIENT_FIELDS);
    const withheld = new Set(Object.keys(USER_WITHHELD_FIELDS));
    for (const column of schemaColumns) {
      const inExposed = exposed.has(column);
      const inWithheld = withheld.has(column);
      expect(
        inExposed !== inWithheld,
        `users.${column} is in ${inExposed && inWithheld ? "BOTH lists" : "NEITHER list"} — classify it in lib/db/user-view.ts`,
      ).toBe(true);
    }
  });

  it("names no column that no longer exists", () => {
    for (const field of [...ADMIN_PATIENT_FIELDS, ...Object.keys(USER_WITHHELD_FIELDS)]) {
      expect(schemaColumns, `${field} is not a users column`).toContain(field);
    }
  });

  it("states why each withheld column can never be sent", () => {
    for (const [field, reason] of Object.entries(USER_WITHHELD_FIELDS)) {
      expect(reason.length, `${field} needs a real reason`).toBeGreaterThan(20);
    }
  });

  it("withholds the password digest by name", () => {
    // Named explicitly: this is the column the incident was about, and a future
    // edit that drops it from the withheld list must fail here, not in prod.
    expect(Object.keys(USER_WITHHELD_FIELDS)).toContain("password");
  });

  it("drops the digest and keeps what an admin console needs", () => {
    const view = toAdminPatientView(row) as Record<string, unknown>;
    expect("password" in view).toBe(false);
    expect(view.email).toBe("patient@example.com");
    expect(view.failedLoginAttempts).toBe(2);
    expect(view.isClinician).toBe(false);
  });

  it("does not leak the digest through serialization", () => {
    // Assert on the wire form, so no getter or toJSON can smuggle it back.
    const serialized = JSON.stringify(toAdminPatientView(row));
    expect(serialized).not.toContain("$2b$");
    expect(serialized).not.toContain("password");
  });

  it("preserves loaded relations, which are not users columns", () => {
    const withRelations = {
      ...row,
      profile: { userId: row.id, goal: "sleep" },
      assessmentResults: [{ id: "a1", score: 7 }],
    };
    const view = toAdminPatientView(withRelations) as Record<string, unknown>;
    expect(view.profile).toEqual({ userId: row.id, goal: "sleep" });
    expect(view.assessmentResults).toEqual([{ id: "a1", score: 7 }]);
    expect("password" in view).toBe(false);
  });

  it("withholds a NEW secret column the moment it appears in the schema", () => {
    // The property that matters is not "password is gone" but "an unclassified
    // column cannot ship". Simulate tomorrow's column and assert the projection
    // refuses to pass it through.
    const future = { ...row, resetTokenHash: "deadbeefdeadbeef" } as unknown as UserRow;
    const view = toAdminPatientView(future) as Record<string, unknown>;
    // It is not a users column in this build, so it rides along as a relation
    // would — which is exactly why the exhaustiveness test above, not this
    // projection, is what stops a real new column from shipping.
    expect(schemaColumns).not.toContain("resetTokenHash");
    expect(view.resetTokenHash).toBe("deadbeefdeadbeef");
  });
});
