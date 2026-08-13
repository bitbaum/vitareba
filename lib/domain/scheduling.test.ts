/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import { generateSlots, isBookableSlot, slotBusyInterval } from "./scheduling";
import { DEFAULT_AVAILABILITY, getAvailabilityForEmail } from "@/lib/config/scheduling";
import { CLINIC_TIMEZONE } from "@/lib/config/company";

const HOUR = 3_600_000;
const RULES = DEFAULT_AVAILABILITY;

/** Clinic-timezone wall time of an instant, "HH:MM". */
function clinicTime(d: Date): string {
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: CLINIC_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function clinicWeekday(d: Date): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: CLINIC_TIMEZONE, weekday: "short" }).format(d);
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd) + 1;
}

// A Monday 08:00 UTC in high summer (CEST, UTC+2) — deterministic base
const NOW = new Date("2026-08-10T08:00:00Z");

describe("generateSlots", () => {
  it("offers slots only inside configured working windows, in clinic wall time", () => {
    const slots = generateSlots({ now: NOW, rules: RULES, busy: [] });
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      const windows = RULES.weeklyHours[clinicWeekday(s)];
      const t = clinicTime(s);
      const inWindow = windows.some(([start, end]) => t >= start && t < end);
      expect(inWindow, `${s.toISOString()} (${t}) outside windows`).toBe(true);
    }
  });

  it("never offers a slot on a day with empty windows (weekend)", () => {
    const slots = generateSlots({ now: NOW, rules: RULES, busy: [] });
    for (const s of slots) {
      expect(RULES.weeklyHours[clinicWeekday(s)].length, s.toISOString()).toBeGreaterThan(0);
    }
  });

  it("respects lead time and horizon", () => {
    const slots = generateSlots({ now: NOW, rules: RULES, busy: [] });
    const earliest = NOW.getTime() + RULES.leadTimeHours * HOUR;
    const latest = NOW.getTime() + RULES.horizonDays * 24 * HOUR;
    for (const s of slots) {
      expect(s.getTime()).toBeGreaterThanOrEqual(earliest);
      expect(s.getTime()).toBeLessThanOrEqual(latest);
    }
  });

  it("removes slots overlapping a busy interval, including the buffer", () => {
    const free = generateSlots({ now: NOW, rules: RULES, busy: [] });
    const taken = free[0];
    const remaining = generateSlots({ now: NOW, rules: RULES, busy: [slotBusyInterval(taken, RULES)] });
    expect(remaining.some((s) => s.getTime() === taken.getTime())).toBe(false);
    const next = remaining.find((s) => s.getTime() > taken.getTime());
    expect(next!.getTime()).toBeGreaterThanOrEqual(
      taken.getTime() + (RULES.slotMinutes + RULES.bufferMinutes) * 60_000
    );
  });

  it("caps appointments per clinic day at maxPerDay", () => {
    const free = generateSlots({ now: NOW, rules: RULES, busy: [] });
    const firstDay = free[0];
    const sameDay = free.filter(
      (s) => clinicWeekday(s) === clinicWeekday(firstDay) && s.getTime() - firstDay.getTime() < 24 * HOUR
    );
    const busy = sameDay.slice(0, RULES.maxPerDay).map((s) => slotBusyInterval(s, RULES));
    const remaining = generateSlots({ now: NOW, rules: RULES, busy });
    const remainingSameDay = remaining.filter(
      (s) => s >= firstDay && s.getTime() - firstDay.getTime() < 14 * HOUR
    );
    expect(remainingSameDay).toEqual([]);
  });

  it("slots are ascending and unique", () => {
    const slots = generateSlots({ now: NOW, rules: RULES, busy: [] });
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].getTime()).toBeGreaterThan(slots[i - 1].getTime());
    }
  });

  it("winter (CET) slots still land on configured wall times", () => {
    const winterNow = new Date("2026-01-12T08:00:00Z"); // Monday, UTC+1
    const slots = generateSlots({ now: winterNow, rules: RULES, busy: [] });
    expect(slots.length).toBeGreaterThan(0);
    const t = clinicTime(slots[0]);
    const windows = RULES.weeklyHours[clinicWeekday(slots[0])];
    expect(windows.some(([start, end]) => t >= start && t < end)).toBe(true);
  });

  it("per-clinician rules produce different calendars (George evenings vs default)", () => {
    const george = getAvailabilityForEmail("butaeff@gmail.com");
    const slots = generateSlots({ now: NOW, rules: george, busy: [] });
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      const windows = george.weeklyHours[clinicWeekday(s)];
      const t = clinicTime(s);
      expect(windows.some(([start, end]) => t >= start && t < end), `${s.toISOString()} (${t})`).toBe(true);
    }
    // Monday 09:00 exists for default rules but not for George's evening hours
    const defSlots = generateSlots({ now: NOW, rules: RULES, busy: [] });
    const defMorning = defSlots.some((s) => clinicTime(s) === "09:00" && clinicWeekday(s) === 1);
    const georgeMorningMonday = slots.some((s) => clinicTime(s) === "09:00" && clinicWeekday(s) === 1);
    expect(defMorning).toBe(true);
    expect(georgeMorningMonday).toBe(false);
  });

  it("unknown clinician email falls back to DEFAULT_AVAILABILITY", () => {
    expect(getAvailabilityForEmail("nobody@example.com")).toEqual(DEFAULT_AVAILABILITY);
    expect(getAvailabilityForEmail(null)).toEqual(DEFAULT_AVAILABILITY);
  });
});

describe("isBookableSlot", () => {
  it("accepts an offered slot and rejects a fabricated off-grid one", () => {
    const slots = generateSlots({ now: NOW, rules: RULES, busy: [] });
    expect(isBookableSlot(slots[0], { now: NOW, rules: RULES, busy: [] })).toBe(true);
    const offGrid = new Date(slots[0].getTime() + 7 * 60_000);
    expect(isBookableSlot(offGrid, { now: NOW, rules: RULES, busy: [] })).toBe(false);
  });

  it("rejects a slot that just became busy (race re-check)", () => {
    const slots = generateSlots({ now: NOW, rules: RULES, busy: [] });
    const taken = slots[0];
    expect(isBookableSlot(taken, { now: NOW, rules: RULES, busy: [slotBusyInterval(taken, RULES)] })).toBe(false);
  });
});
