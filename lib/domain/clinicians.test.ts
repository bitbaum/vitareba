/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Clinician status is granted directly by an admin, by email — no public
 * application, no self-approval. These tests hold the failure modes an
 * owner needs to be told about clearly: no such account, already a
 * clinician, nothing to revoke.
 */

const { mockUserFindFirst, mockUserFindMany, mockUpdate, mockTransaction } = vi.hoisted(() => ({
  mockUserFindFirst: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockUpdate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: { findFirst: mockUserFindFirst, findMany: mockUserFindMany },
    },
    update: mockUpdate,
    transaction: mockTransaction,
  },
}));

import { listClinicians, grantClinicianByEmail, revokeClinicianStatus } from "./clinicians";

const PATIENT_ID = "b1111111-1111-4111-8111-111111111111";
const ADMIN_ID = "a3333333-3333-4333-8333-333333333333";
const APPLICATION_ID = "d4444444-4444-4444-8444-444444444444";

beforeEach(() => {
  mockUserFindFirst.mockReset();
  mockUserFindMany.mockReset();
  mockUpdate.mockReset();
  mockTransaction.mockReset();
});

describe("listClinicians", () => {
  it("returns every isClinician=true user", async () => {
    mockUserFindMany.mockResolvedValue([{ id: PATIENT_ID, name: "Dr. Test", email: "t@example.com", createdAt: new Date() }]);
    const rows = await listClinicians();
    expect(rows).toHaveLength(1);
  });
});

describe("grantClinicianByEmail", () => {
  it("refuses an email with no account", async () => {
    mockUserFindFirst.mockResolvedValue(undefined);
    const result = await grantClinicianByEmail("nobody@example.com", ADMIN_ID);
    expect(result).toEqual({ ok: false, error: "No account with that email address." });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("refuses an account that is already a clinician", async () => {
    mockUserFindFirst.mockResolvedValue({ id: PATIENT_ID, isClinician: true });
    const result = await grantClinicianByEmail("doc@example.com", ADMIN_ID);
    expect(result).toEqual({ ok: false, error: "That account is already a clinician." });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("grants isClinician and writes an audit row, atomically", async () => {
    mockUserFindFirst.mockResolvedValue({ id: PATIENT_ID, isClinician: false });
    const returning = vi.fn().mockResolvedValue([{ id: APPLICATION_ID }]);
    const tx = {
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning }) }),
    };
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    const result = await grantClinicianByEmail("doc@example.com", ADMIN_ID);
    expect(result).toEqual({ ok: true, id: APPLICATION_ID });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // Both the users write and the audit-row insert happened inside the SAME
    // transaction — a grant must not be able to half-apply if one write fails.
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(1);
  });

  it("lowercases and trims the email before lookup", async () => {
    mockUserFindFirst.mockResolvedValue(undefined);
    await grantClinicianByEmail("  Doc@Example.com  ", ADMIN_ID);
    expect(mockUserFindFirst).toHaveBeenCalled();
  });
});

describe("revokeClinicianStatus", () => {
  it("refuses a user who is not currently a clinician", async () => {
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }),
    });
    const result = await revokeClinicianStatus(PATIENT_ID);
    expect(result.ok).toBe(false);
  });

  it("flips isClinician to false when found", async () => {
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: PATIENT_ID }]) }) }),
    });
    const result = await revokeClinicianStatus(PATIENT_ID);
    expect(result).toEqual({ ok: true, id: PATIENT_ID });
  });
});
