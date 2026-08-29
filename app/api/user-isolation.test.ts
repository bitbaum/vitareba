/// <reference types="vitest/globals" />
/**
 * Cross-user patient-data isolation — regression net.
 *
 * Auth here is app-layer only (no RLS): a single missing
 * `eq(table.userId, session.user.id)` where-clause leaks one patient's
 * medical data to another. The route tests elsewhere mock the DB blindly,
 * so they still pass if that scoping is deleted. This file closes the gap:
 * the DB mock EVALUATES the real Drizzle where-condition (compiled via
 * PgDialect) against an in-memory store containing TWO patients' rows.
 * Delete the userId scoping in a route and the mock — like real Postgres —
 * returns the other patient's rows, and these assertions fail.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const {
  mockRequireSession,
  mockRequireAdmin,
  mockCheckinFindFirst,
  mockCheckinFindMany,
  mockDocumentFindMany,
  mockUserFindFirst,
  mockUpdate,
  mockUpdateWhere,
  mockInsert,
  mockInsertValues,
  mockSendEmail,
  mockRunAfterResponse,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockRequireAdmin: vi.fn(),
  mockCheckinFindFirst: vi.fn(),
  mockCheckinFindMany: vi.fn(),
  mockDocumentFindMany: vi.fn(),
  mockUserFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockInsert: vi.fn(),
  mockInsertValues: vi.fn(),
  mockSendEmail: vi.fn(),
  // Capture only — never invoked, so deferred work (emails, streaks) stays inert.
  mockRunAfterResponse: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireSession: mockRequireSession,
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      dailyCheckins: {
        findFirst: mockCheckinFindFirst,
        findMany: mockCheckinFindMany,
      },
      documents: { findMany: mockDocumentFindMany },
      users: { findFirst: mockUserFindFirst },
    },
    update: mockUpdate,
    insert: mockInsert,
  },
}));

vi.mock("@/lib/email/index", () => ({ sendEmail: mockSendEmail }));

vi.mock("@/lib/config/company", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config/company")>();
  return { ...actual, PORTAL_URL: "https://portal.example.com" };
});

vi.mock("@/lib/utils/post-response", () => ({ runAfterResponse: mockRunAfterResponse }));

import { GET as getCheckins, POST as postCheckin } from "./checkin/route";
import { GET as getDocuments } from "./documents/route";

// ─── Where-clause evaluation harness ──────────────────────────────────────────

const dialect = new PgDialect();

/**
 * Simulates Postgres for the conjunctive-equality where-clauses these routes
 * use: compiles the Drizzle condition to parameterized SQL and keeps only rows
 * whose column values satisfy every bound parameter.
 *
 * Crucially: NO where-clause (or one that no longer binds the user id) returns
 * rows for EVERY patient — exactly like a real unscoped query. That is the
 * leak this net exists to detect.
 */
function queryRows<T extends Record<string, unknown>>(rows: T[], where?: SQL): T[] {
  if (!where) return rows;
  const { params } = dialect.sqlToQuery(where);
  return rows.filter((row) => params.every((p) => Object.values(row).includes(p)));
}

// ─── Fixtures — two patients, interleaved data ────────────────────────────────

const ALICE_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const BOB_ID = "b1ffcd99-9d0b-4ef8-bb6d-6bb9bd380b22";

const ALICE_SESSION = {
  session: { user: { id: ALICE_ID, role: "patient", email: "alice@example.com" } },
  error: null,
};

// Fixed "now" so the checkinSchema not-in-the-future refinement is deterministic
const NOW = new Date("2026-05-07T09:00:00.000Z");
const TODAY = "2026-05-07";
const YESTERDAY = "2026-05-06";

const checkinRow = (userId: string, date: string) => ({
  id: `checkin-${userId}-${date}`,
  userId,
  date,
  sleep: 3,
  energy: 3,
  mood: 3,
  focus: 3,
  stress: 3,
  notes: null,
  createdAt: new Date(`${date}T08:00:00.000Z`),
});

const documentRow = (userId: string, title: string) => ({
  id: `doc-${userId}`,
  userId,
  title,
  fileUrl: `https://example.com/uploads/${title}.pdf`,
  mimeType: "application/pdf",
  uploadedBy: "admin-1",
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
});

const VALID_CHECKIN = { date: TODAY, sleep: 4, energy: 4, mood: 4, focus: 4, stress: 2 };

/** Mutable per-test stores the evaluating mocks read from */
let checkinStore: ReturnType<typeof checkinRow>[];
let documentStore: ReturnType<typeof documentRow>[];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("cross-user patient-data isolation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    mockRequireSession.mockReset();
    mockRequireAdmin.mockReset();
    mockCheckinFindFirst.mockReset();
    mockCheckinFindMany.mockReset();
    mockDocumentFindMany.mockReset();
    mockUserFindFirst.mockReset();
    mockUpdate.mockReset();
    mockUpdateWhere.mockReset();
    mockInsert.mockReset();
    mockInsertValues.mockReset();
    mockSendEmail.mockReset();
    mockRunAfterResponse.mockReset();

    checkinStore = [];
    documentStore = [];

    // The DB mock honours the routes' real where-clauses against the stores
    mockCheckinFindMany.mockImplementation(async (opts?: { where?: SQL }) =>
      queryRows(checkinStore, opts?.where),
    );
    mockCheckinFindFirst.mockImplementation(
      async (opts?: { where?: SQL }) => queryRows(checkinStore, opts?.where)[0],
    );
    mockDocumentFindMany.mockImplementation(async (opts?: { where?: SQL }) =>
      queryRows(documentStore, opts?.where),
    );

    mockUpdateWhere.mockResolvedValue({});
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: mockUpdateWhere }),
    });
    mockInsertValues.mockResolvedValue({});
    mockInsert.mockReturnValue({ values: mockInsertValues });
  });

  afterEach(() => vi.useRealTimers());

  describe("GET /api/checkin", () => {
    it("returns only the session user's check-ins, never another patient's", async () => {
      mockRequireSession.mockResolvedValue(ALICE_SESSION);
      checkinStore = [
        checkinRow(ALICE_ID, TODAY),
        checkinRow(BOB_ID, TODAY), // must never be visible to Alice
        checkinRow(ALICE_ID, YESTERDAY),
        checkinRow(BOB_ID, YESTERDAY),
      ];

      const res = await getCheckins(new Request("https://example.com/api/checkin"));
      expect(res.status).toBe(200);
      const { data } = await res.json();

      // Unscoped query would return all 4 rows and fail here
      expect(data.checkins).toHaveLength(2);
      const owners = new Set(data.checkins.map((c: { userId: string }) => c.userId));
      expect(owners).toEqual(new Set([ALICE_ID]));
    });
  });

  describe("POST /api/checkin", () => {
    it("does not treat another patient's same-day check-in as the session user's (inserts, never updates)", async () => {
      mockRequireSession.mockResolvedValue(ALICE_SESSION);
      // Bob already checked in today; Alice has not. If the existence lookup
      // loses its userId scoping it finds Bob's row and the route takes the
      // UPDATE path — overwriting Bob's medical data with Alice's submission.
      checkinStore = [checkinRow(BOB_ID, TODAY), checkinRow(ALICE_ID, YESTERDAY)];

      const res = await postCheckin(
        new Request("https://example.com/api/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(VALID_CHECKIN),
        }),
      );

      expect(res.status).toBe(200);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({ userId: ALICE_ID, date: TODAY }),
      );
    });

    it("scopes the UPDATE of an existing check-in to the session user", async () => {
      mockRequireSession.mockResolvedValue(ALICE_SESSION);
      // Both patients checked in today — Alice edits hers
      checkinStore = [checkinRow(ALICE_ID, TODAY), checkinRow(BOB_ID, TODAY)];

      const res = await postCheckin(
        new Request("https://example.com/api/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(VALID_CHECKIN),
        }),
      );

      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledTimes(1);

      // The UPDATE's where-clause must bind user_id to the session user —
      // a date-only clause would rewrite every patient's check-in for today
      const whereClause = mockUpdateWhere.mock.calls[0][0] as SQL;
      const { sql, params } = dialect.sqlToQuery(whereClause);
      expect(sql).toMatch(/user_id/);
      expect(params).toContain(ALICE_ID);
      expect(params).not.toContain(BOB_ID);
    });
  });

  describe("GET /api/documents", () => {
    it("ignores ?patientId for patient sessions — a patient cannot read another patient's documents", async () => {
      mockRequireSession.mockResolvedValue(ALICE_SESSION);
      documentStore = [
        documentRow(ALICE_ID, "alice-lab-results"),
        documentRow(BOB_ID, "bob-psych-eval"), // must never be visible to Alice
      ];

      const res = await getDocuments(
        new Request(`https://example.com/api/documents?patientId=${BOB_ID}`),
      );
      expect(res.status).toBe(200);
      const { data } = await res.json();

      expect(data).toHaveLength(1);
      expect(data[0].userId).toBe(ALICE_ID);
      expect(data.some((d: { userId: string }) => d.userId === BOB_ID)).toBe(false);
    });
  });
});
