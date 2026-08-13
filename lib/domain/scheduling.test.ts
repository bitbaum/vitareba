/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import { generateSlots, isBookableSlot, slotBusyInterval } from "./scheduling";
import {
  SLOT_MINUTES,
  BUFFER_MINUTES,
  LEAD_TIME_HOURS,
  HORIZON_DAYS,
  MAX_PER_DAY,
  WEEKLY_HOURS,
} from "@/lib/config/scheduling";
import { CLINIC_TIMEZONE } from "@/lib/config/company";

const HOUR = 3_600_000;

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
    const slots = generateSlots({ now: NOW, busy: [] });
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      const windows = WEEKLY_HOURS[clinicWeekday(s)];
      const t = clinicTime(s);
      const inWindow = windows.some(([start, end]) => t >= start && t < end);
      expect(inWindow, `${s.toISOString()} (${t}) outside windows`).toBe(true);
    }
  });

  it("never offers a slot on a day with empty windows (weekend)", () => {
    const slots = generateSlots({ now: NOW, busy: [] });
    for (const s of slots) {
      expect(WEEKLY_HOURS[clinicWeekday(s)].length, s.toISOString()).toBeGreaterThan(0);
    }
  });

  it("respects lead time and horizon", () => {
    const slots = generateSlots({ now: NOW, busy: [] });
    const earliest = NOW.getTime() + LEAD_TIME_HOURS * HOUR;
    const latest = NOW.getTime() + HORIZON_DAYS * 24 * HOUR;
    for (const s of slots) {
      expect(s.getTime()).toBeGreaterThanOrEqual(earliest);
      expect(s.getTime()).toBeLessThanOrEqual(latest);
    }
  });

  it("removes slots overlapping a busy interval, including the buffer", () => {
    const free = generateSlots({ now: NOW, busy: [] });
    const taken = free[0];
    const remaining = generateSlots({ now: NOW, busy: [slotBusyInterval(taken)] });
    expect(remaining.some((s) => s.getTime() === taken.getTime())).toBe(false);
    // The very next offered slot must start at or after the busy interval ends
    const next = remaining.find((s) => s.getTime() > taken.getTime());
    expect(next!.getTime()).toBeGreaterThanOrEqual(
      taken.getTime() + (SLOT_MINUTES + BUFFER_MINUTES) * 60_000
    );
  });

  it("caps appointments per clinic day at MAX_PER_DAY", () => {
    const free = generateSlots({ now: NOW, busy: [] });
    const firstDay = free[0];
    const sameDay = free.filter(
      (s) => clinicWeekday(s) === clinicWeekday(firstDay) && s.getTime() - firstDay.getTime() < 24 * HOUR
    );
    const busy = sameDay.slice(0, MAX_PER_DAY).map(slotBusyInterval);
    const remaining = generateSlots({ now: NOW, busy });
    const remainingSameDay = remaining.filter(
      (s) => s >= firstDay && s.getTime() - firstDay.getTime() < 14 * HOUR
    );
    expect(remainingSameDay).toEqual([]);
  });

  it("slots are ascending and unique", () => {
    const slots = generateSlots({ now: NOW, busy: [] });
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].getTime()).toBeGreaterThan(slots[i - 1].getTime());
    }
  });

  it("winter (CET) slots still land on configured wall times", () => {
    const winterNow = new Date("2026-01-12T08:00:00Z"); // Monday, UTC+1
    const slots = generateSlots({ now: winterNow, busy: [] });
    expect(slots.length).toBeGreaterThan(0);
    const t = clinicTime(slots[0]);
    const windows = WEEKLY_HOURS[clinicWeekday(slots[0])];
    expect(windows.some(([start, end]) => t >= start && t < end)).toBe(true);
  });
});

describe("isBookableSlot", () => {
  it("accepts an offered slot and rejects a fabricated off-grid one", () => {
    const slots = generateSlots({ now: NOW, busy: [] });
    expect(isBookableSlot(slots[0], { now: NOW, busy: [] })).toBe(true);
    const offGrid = new Date(slots[0].getTime() + 7 * 60_000);
    expect(isBookableSlot(offGrid, { now: NOW, busy: [] })).toBe(false);
  });

  it("rejects a slot that just became busy (race re-check)", () => {
    const slots = generateSlots({ now: NOW, busy: [] });
    const taken = slots[0];
    expect(isBookableSlot(taken, { now: NOW, busy: [slotBusyInterval(taken)] })).toBe(false);
  });
});
