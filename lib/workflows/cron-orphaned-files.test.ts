/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindMany, mockListLocal, mockDelLocal } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockListLocal: vi.fn(),
  mockDelLocal: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { query: { documents: { findMany: mockFindMany } } } }));

vi.mock("@/lib/storage", () => ({
  listLocal: mockListLocal,
  delLocal: mockDelLocal,
  isLocalUrl: (url: string) => url.startsWith("/uploads/"),
}));

import { runCronOrphanedFiles } from "./cron-orphaned-files";

const KEPT = "/uploads/documents/patient-a/1_labs.pdf";
const ORPHAN = "/uploads/documents/patient-gone/2_scan.pdf";

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([{ fileUrl: KEPT }]);
  mockListLocal.mockResolvedValue([KEPT, ORPHAN]);
  mockDelLocal.mockResolvedValue(undefined);
});

describe("runCronOrphanedFiles", () => {
  it("deletes a file no document row points at", async () => {
    const result = await runCronOrphanedFiles();
    expect(mockDelLocal).toHaveBeenCalledExactlyOnceWith(ORPHAN);
    expect(result).toEqual({ success: true, deleted: 1, kept: 1 });
  });

  it("keeps every file that is still referenced", async () => {
    mockListLocal.mockResolvedValue([KEPT]);
    const result = await runCronOrphanedFiles();
    expect(mockDelLocal).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, deleted: 0, kept: 1 });
  });

  /**
   * The dangerous failure: an unreachable database returns zero rows, which
   * reads as "nothing is referenced" and would delete every patient document
   * on the box. Failing closed is the whole safety property here.
   */
  it("deletes NOTHING when the database read fails", async () => {
    mockFindMany.mockRejectedValue(new Error("db down"));
    const result = await runCronOrphanedFiles();
    expect(mockDelLocal).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: "Database unavailable" });
  });

  it("ignores externally-linked documents when deciding what is referenced", async () => {
    mockFindMany.mockResolvedValue([{ fileUrl: "https://lab.example.com/r.pdf" }]);
    mockListLocal.mockResolvedValue([ORPHAN]);
    const result = await runCronOrphanedFiles();
    expect(mockDelLocal).toHaveBeenCalledExactlyOnceWith(ORPHAN);
    expect(result.success && result.deleted).toBe(1);
  });

  it("keeps going when one delete fails", async () => {
    const other = "/uploads/documents/x/3_a.pdf";
    mockListLocal.mockResolvedValue([ORPHAN, other]);
    mockDelLocal.mockRejectedValueOnce(new Error("EACCES"));
    const result = await runCronOrphanedFiles();
    expect(mockDelLocal).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ success: true, deleted: 1, kept: 1 });
  });

  it("is a no-op on an empty store", async () => {
    mockListLocal.mockResolvedValue([]);
    expect(await runCronOrphanedFiles()).toEqual({ success: true, deleted: 0, kept: 0 });
  });
});
