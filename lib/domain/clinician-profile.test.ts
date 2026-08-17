/// <reference types="vitest/globals" />
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * getClinicianAvailability is what replaced a hardcoded per-email object in
 * lib/config/scheduling.ts — real per-clinician hours now live in the
 * database, with the exact same "no row = DEFAULT_AVAILABILITY" fallback the
 * old override map gave an unlisted clinician. These tests hold that
 * contract in place, field by field, so a clinician who has only set their
 * working hours doesn't accidentally reset their appointment length to null.
 */

const { mockClinicianProfileFindFirst, mockUserFindFirst, mockInsert } = vi.hoisted(() => ({
  mockClinicianProfileFindFirst: vi.fn(),
  mockUserFindFirst: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      clinicianProfiles: { findFirst: mockClinicianProfileFindFirst },
      users: { findFirst: mockUserFindFirst },
    },
    insert: mockInsert,
  },
}));

import {
  getClinicianAvailability,
  getClinicianProfile,
  getPublicClinicianProfile,
  updateClinicianProfile,
  clinicianProfileUpdateSchema,
} from "./clinician-profile";
import { DEFAULT_AVAILABILITY } from "@/lib/config/scheduling";

const CLINICIAN_ID = "c2222222-2222-4222-8222-222222222222";

beforeEach(() => {
  mockClinicianProfileFindFirst.mockReset();
  mockUserFindFirst.mockReset();
  mockInsert.mockReset();
});

describe("getClinicianAvailability", () => {
  it("falls back to DEFAULT_AVAILABILITY entirely when the clinician has no row", async () => {
    mockClinicianProfileFindFirst.mockResolvedValue(undefined);
    const rules = await getClinicianAvailability(CLINICIAN_ID);
    expect(rules).toEqual(DEFAULT_AVAILABILITY);
  });

  it("merges a partial row over the defaults, field by field", async () => {
    // Only weeklyHours and slotMinutes were ever set — everything else must
    // still read as the default, not null/undefined.
    mockClinicianProfileFindFirst.mockResolvedValue({
      bio: null,
      title: null,
      specialties: [],
      weeklyHours: { 1: [["10:00", "14:00"]], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] },
      slotMinutes: 45,
      bufferMinutes: null,
      leadTimeHours: null,
      horizonDays: null,
      maxPerDay: null,
    });
    const rules = await getClinicianAvailability(CLINICIAN_ID);
    expect(rules.weeklyHours[1]).toEqual([["10:00", "14:00"]]);
    expect(rules.slotMinutes).toBe(45);
    expect(rules.bufferMinutes).toBe(DEFAULT_AVAILABILITY.bufferMinutes);
    expect(rules.leadTimeHours).toBe(DEFAULT_AVAILABILITY.leadTimeHours);
    expect(rules.horizonDays).toBe(DEFAULT_AVAILABILITY.horizonDays);
    expect(rules.maxPerDay).toBe(DEFAULT_AVAILABILITY.maxPerDay);
  });
});

describe("getClinicianProfile", () => {
  it("returns null (not a zeroed-out object) when no row exists — the UI must be able to tell 'unset' from 'set to empty'", async () => {
    mockClinicianProfileFindFirst.mockResolvedValue(undefined);
    expect(await getClinicianProfile(CLINICIAN_ID)).toBeNull();
  });
});

describe("getPublicClinicianProfile", () => {
  it("returns null for an account that is not a clinician — never leaks a patient's profile shape", async () => {
    mockUserFindFirst.mockResolvedValue({ id: CLINICIAN_ID, name: "Alex", isClinician: false });
    expect(await getPublicClinicianProfile(CLINICIAN_ID)).toBeNull();
  });

  it("reads as accepting with default hours when the clinician has never touched their settings", async () => {
    mockUserFindFirst.mockResolvedValue({
      id: CLINICIAN_ID,
      name: "Dr Alex",
      isClinician: true,
      profile: null,
      clinicianProfile: null,
    });
    const profile = await getPublicClinicianProfile(CLINICIAN_ID);
    expect(profile).toEqual({
      id: CLINICIAN_ID,
      name: "Dr Alex",
      title: null,
      bio: null,
      specialties: [],
      acceptingPatients: true,
      weeklyHours: DEFAULT_AVAILABILITY.weeklyHours,
    });
  });

  it("never exposes booking-engine tuning (leadTimeHours etc) — those are not on the returned shape at all", async () => {
    mockUserFindFirst.mockResolvedValue({
      id: CLINICIAN_ID,
      name: "Dr Alex",
      isClinician: true,
      profile: { acceptingPatients: false },
      clinicianProfile: { bio: "Hi", title: "MD", specialties: ["ADHD"], weeklyHours: null },
    });
    const profile = await getPublicClinicianProfile(CLINICIAN_ID);
    expect(profile).not.toHaveProperty("leadTimeHours");
    expect(profile).not.toHaveProperty("horizonDays");
    expect(profile).not.toHaveProperty("maxPerDay");
    expect(profile?.acceptingPatients).toBe(false);
    expect(profile?.bio).toBe("Hi");
  });
});

describe("updateClinicianProfile", () => {
  it("upserts — a clinician editing settings for the first time must not need a row to already exist", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    mockInsert.mockReturnValue({ values });

    await updateClinicianProfile(CLINICIAN_ID, { bio: "New bio" });

    expect(mockInsert).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ userId: CLINICIAN_ID, bio: "New bio" }));
    expect(onConflictDoUpdate).toHaveBeenCalled();
  });
});

describe("clinicianProfileUpdateSchema", () => {
  it("accepts a well-formed weekly-hours patch", () => {
    const result = clinicianProfileUpdateSchema.safeParse({
      weeklyHours: { "1": [["09:00", "12:00"]], "2": [] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a window where the end is not after the start", () => {
    const result = clinicianProfileUpdateSchema.safeParse({
      weeklyHours: { "1": [["12:00", "09:00"]] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed time string", () => {
    const result = clinicianProfileUpdateSchema.safeParse({
      weeklyHours: { "1": [["9am", "17:00"]] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an out-of-range weekday key", () => {
    const result = clinicianProfileUpdateSchema.safeParse({
      weeklyHours: { "8": [["09:00", "12:00"]] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a slot length that is not a positive integer", () => {
    expect(clinicianProfileUpdateSchema.safeParse({ slotMinutes: 0 }).success).toBe(false);
    expect(clinicianProfileUpdateSchema.safeParse({ slotMinutes: 30.5 }).success).toBe(false);
  });
});
