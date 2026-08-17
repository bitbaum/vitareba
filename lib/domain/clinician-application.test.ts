/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Becoming a clinician goes through exactly one door: submit, then an admin
 * approves or declines. These tests hold the transitions in place — no
 * self-approval, no double-pending, no deciding an application twice.
 */

const {
  mockUserFindFirst,
  mockApplicationFindFirst,
  mockApplicationFindMany,
  mockInsert,
  mockUpdate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockUserFindFirst: vi.fn(),
  mockApplicationFindFirst: vi.fn(),
  mockApplicationFindMany: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: { findFirst: mockUserFindFirst },
      clinicianApplications: { findFirst: mockApplicationFindFirst, findMany: mockApplicationFindMany },
    },
    insert: mockInsert,
    update: mockUpdate,
    transaction: mockTransaction,
  },
}));

import {
  submitApplication,
  approveApplication,
  declineApplication,
  getOwnLatestApplication,
} from "./clinician-application";

const PATIENT_ID = "b1111111-1111-4111-8111-111111111111";
const ADMIN_ID = "a3333333-3333-4333-8333-333333333333";
const APPLICATION_ID = "d4444444-4444-4444-8444-444444444444";

beforeEach(() => {
  mockUserFindFirst.mockReset();
  mockApplicationFindFirst.mockReset();
  mockApplicationFindMany.mockReset();
  mockInsert.mockReset();
  mockUpdate.mockReset();
  mockTransaction.mockReset();
});

describe("submitApplication", () => {
  it("refuses someone who is already a clinician", async () => {
    mockUserFindFirst.mockResolvedValue({ isClinician: true });
    const result = await submitApplication(PATIENT_ID, "I'm a doctor");
    expect(result).toEqual({ ok: false, error: "You are already a clinician." });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("refuses a second application while one is still pending", async () => {
    mockUserFindFirst.mockResolvedValue({ isClinician: false });
    mockApplicationFindFirst.mockResolvedValue({ id: "existing" });
    const result = await submitApplication(PATIENT_ID, "Again");
    expect(result.ok).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("accepts a first application from a plain patient", async () => {
    mockUserFindFirst.mockResolvedValue({ isClinician: false });
    mockApplicationFindFirst.mockResolvedValue(undefined);
    const returning = vi.fn().mockResolvedValue([{ id: APPLICATION_ID }]);
    const values = vi.fn().mockReturnValue({ returning });
    mockInsert.mockReturnValue({ values });

    const result = await submitApplication(PATIENT_ID, "I'm a licensed GP");
    expect(result).toEqual({ ok: true, id: APPLICATION_ID });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: PATIENT_ID, message: "I'm a licensed GP" })
    );
  });
});

describe("getOwnLatestApplication", () => {
  it("returns null, not undefined, when nothing has ever been submitted", async () => {
    mockApplicationFindFirst.mockResolvedValue(undefined);
    expect(await getOwnLatestApplication(PATIENT_ID)).toBeNull();
  });
});

describe("approveApplication", () => {
  it("refuses an application that is not pending — no re-approving a decided one", async () => {
    mockApplicationFindFirst.mockResolvedValue(undefined); // loadPending filters on status=pending
    const result = await approveApplication(APPLICATION_ID, ADMIN_ID);
    expect(result.ok).toBe(false);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("grants isClinician and marks the application approved, atomically", async () => {
    mockApplicationFindFirst.mockResolvedValue({ id: APPLICATION_ID, userId: PATIENT_ID, status: "pending" });
    const tx = {
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
    };
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => cb(tx));

    const result = await approveApplication(APPLICATION_ID, ADMIN_ID);
    expect(result).toEqual({ ok: true, id: APPLICATION_ID });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // Both writes happened inside the SAME transaction — grant + decision must
    // not be able to half-apply if one write fails.
    expect(tx.update).toHaveBeenCalledTimes(2);
  });
});

describe("declineApplication", () => {
  it("refuses an application that is not pending", async () => {
    mockApplicationFindFirst.mockResolvedValue(undefined);
    const result = await declineApplication(APPLICATION_ID, ADMIN_ID, "Not licensed here");
    expect(result.ok).toBe(false);
  });

  it("records the status and the reviewer's note, never touching isClinician", async () => {
    mockApplicationFindFirst.mockResolvedValue({ id: APPLICATION_ID, userId: PATIENT_ID, status: "pending" });
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    mockUpdate.mockReturnValue({ set });

    const result = await declineApplication(APPLICATION_ID, ADMIN_ID, "Not licensed here");
    expect(result).toEqual({ ok: true, id: APPLICATION_ID });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "declined", reviewNote: "Not licensed here", reviewedBy: ADMIN_ID })
    );
    // declineApplication must never call db.update on `users` — grepping the
    // single mockUpdate call's target table isn't observable here, but the
    // transaction-free path (no mockTransaction call) is: approval is the
    // only path that touches isClinician.
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
