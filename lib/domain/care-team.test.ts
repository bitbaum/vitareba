/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * canPatientChooseClinician is the one place "not accepting new patients" is
 * decided. The care-team picker and a new booking both call it — these tests
 * are what keeps "not accepting" meaning the same thing in both places.
 *
 * The property that matters most: closing intake protects a calendar from NEW
 * patients, and must never look like a doctor dropping someone mid-treatment.
 */

const { mockUserFindFirst, mockCareTeamFindFirst, mockBookingFindFirst } = vi.hoisted(() => ({
  mockUserFindFirst: vi.fn(),
  mockCareTeamFindFirst: vi.fn(),
  mockBookingFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: { findFirst: mockUserFindFirst },
      careTeam: { findFirst: mockCareTeamFindFirst },
      bookings: { findFirst: mockBookingFindFirst },
    },
  },
}));

import { canPatientChooseClinician } from "./care-team";

const PATIENT = "b1111111-1111-4111-8111-111111111111";
const CLINICIAN = "c2222222-2222-4222-8222-222222222222";

function clinicianRow(accepting: boolean | null) {
  return {
    id: CLINICIAN,
    name: "Dr Alex",
    email: "alex@example.com",
    profile: accepting === null ? null : { acceptingPatients: accepting },
  };
}

beforeEach(() => {
  mockUserFindFirst.mockReset();
  mockCareTeamFindFirst.mockReset();
  mockBookingFindFirst.mockReset();
});

describe("choosing yourself", () => {
  it("is always allowed, without touching the database", async () => {
    const result = await canPatientChooseClinician(CLINICIAN, CLINICIAN);
    expect(result).toEqual({ ok: true });
    expect(mockUserFindFirst).not.toHaveBeenCalled();
  });
});

describe("an unknown clinician", () => {
  it("is refused, distinctly from 'not accepting'", async () => {
    mockUserFindFirst.mockResolvedValue(undefined);
    const result = await canPatientChooseClinician(PATIENT, CLINICIAN);
    expect(result).toEqual({ ok: false, error: "Unknown clinician" });
  });
});

describe("a clinician who is accepting", () => {
  it("allows a brand new patient", async () => {
    mockUserFindFirst.mockResolvedValue(clinicianRow(true));
    const result = await canPatientChooseClinician(PATIENT, CLINICIAN);
    expect(result).toEqual({ ok: true });
    // The point of the roster default: no profile row and accepting=true both
    // read the same way. Checked via the "missing profile" test below, but the
    // short-circuit here must not even reach care-team / booking lookups.
    expect(mockCareTeamFindFirst).not.toHaveBeenCalled();
    expect(mockBookingFindFirst).not.toHaveBeenCalled();
  });

  it("treats a clinician with no profile row as accepting", async () => {
    mockUserFindFirst.mockResolvedValue(clinicianRow(null));
    const result = await canPatientChooseClinician(PATIENT, CLINICIAN);
    expect(result).toEqual({ ok: true });
  });
});

describe("a clinician who has closed intake", () => {
  beforeEach(() => {
    mockUserFindFirst.mockResolvedValue(clinicianRow(false));
  });

  it("refuses a brand new patient, by name", async () => {
    mockCareTeamFindFirst.mockResolvedValue(undefined);
    mockBookingFindFirst.mockResolvedValue(undefined);
    const result = await canPatientChooseClinician(PATIENT, CLINICIAN);
    expect(result).toEqual({
      ok: false,
      error: "Dr Alex is not accepting new patients right now.",
    });
  });

  it("falls back to a generic name when the clinician has none", async () => {
    mockUserFindFirst.mockResolvedValue({ ...clinicianRow(false), name: null });
    mockCareTeamFindFirst.mockResolvedValue(undefined);
    mockBookingFindFirst.mockResolvedValue(undefined);
    const result = await canPatientChooseClinician(PATIENT, CLINICIAN);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("This clinician");
  });

  it("still allows an existing care-team member — closing intake is not being dropped", async () => {
    mockCareTeamFindFirst.mockResolvedValue({ patientId: PATIENT });
    const result = await canPatientChooseClinician(PATIENT, CLINICIAN);
    expect(result).toEqual({ ok: true });
    // Never needed to fall back to booking history once care-team settled it.
    expect(mockBookingFindFirst).not.toHaveBeenCalled();
  });

  it("still allows a patient with a prior booking, even without care-team membership", async () => {
    // The gap this closes: a patient mid-way through booking their first
    // consultation, before they have ever completed the separate "choose your
    // doctor" step, must not be blocked from confirming that very appointment.
    mockCareTeamFindFirst.mockResolvedValue(undefined);
    mockBookingFindFirst.mockResolvedValue({ id: "booking-1" });
    const result = await canPatientChooseClinician(PATIENT, CLINICIAN);
    expect(result).toEqual({ ok: true });
  });
});
