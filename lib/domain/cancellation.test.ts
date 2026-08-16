/**
 * The cancellation policy, as behaviour rather than prose.
 *
 * The one rule that must never break: a patient can always get out. Everything
 * else here is bookkeeping. A booking system that refuses a cancellation does
 * not gain an attendance — it converts a cancellation into a no-show, which is
 * strictly worse for the clinic and teaches the patient the portal is a trap.
 */
/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import {
  assessCancellation,
  assessReschedule,
  describeNotice,
  hoursOfNotice,
} from "./cancellation";
import { CANCELLATION_NOTICE_HOURS } from "@/lib/config/cancellation";
import { HOUR_MS } from "@/lib/utils/format";

const NOW = new Date("2026-06-15T09:00:00Z");
const inHours = (h: number) => new Date(NOW.getTime() + h * HOUR_MS);

const at = (scheduledAt: Date | null, status = "confirmed") =>
  ({ status, scheduledAt }) as Parameters<typeof assessCancellation>[0];

describe("cancelling is always possible while the appointment is still ahead", () => {
  it("allows a cancellation with plenty of notice", () => {
    const v = assessCancellation(at(inHours(72)), NOW);
    expect(v).toMatchObject({ allowed: true, late: false });
  });

  it("ALLOWS a late cancellation, and marks it late", () => {
    const v = assessCancellation(at(inHours(CANCELLATION_NOTICE_HOURS - 1)), NOW);
    expect(v).toMatchObject({ allowed: true, late: true });
  });

  it("allows a cancellation minutes before, still marked late", () => {
    // The patient who wakes up unable to function must be able to tell us.
    const v = assessCancellation(at(inHours(0.25)), NOW);
    expect(v).toMatchObject({ allowed: true, late: true });
  });

  it("treats exactly the notice boundary as in time", () => {
    // A boundary that rounds against the patient turns a rule they followed
    // into a black mark. Ties go to the person who acted.
    const v = assessCancellation(at(inHours(CANCELLATION_NOTICE_HOURS)), NOW);
    expect(v).toMatchObject({ allowed: true, late: false });
  });

  it("never calls a date-only request late", () => {
    const v = assessCancellation(at(null, "pending"), NOW);
    expect(v).toMatchObject({ allowed: true, late: false, hoursNotice: null });
  });
});

describe("what cannot be cancelled", () => {
  it("refuses an appointment that already started", () => {
    const v = assessCancellation(at(inHours(-0.5)), NOW);
    expect(v.allowed).toBe(false);
  });

  it("refuses one already cancelled", () => {
    expect(assessCancellation(at(inHours(48), "cancelled"), NOW).allowed).toBe(false);
  });

  it("refuses one already attended", () => {
    expect(assessCancellation(at(inHours(-48), "attended"), NOW).allowed).toBe(false);
  });

  it("explains itself in a sentence a patient could read", () => {
    const v = assessCancellation(at(inHours(48), "cancelled"), NOW);
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toMatch(/already cancelled/i);
  });
});

describe("rescheduling follows the same window", () => {
  it("allows a move with notice", () => {
    expect(assessReschedule(at(inHours(72)), NOW)).toMatchObject({ allowed: true, late: false });
  });

  it("allows a late move and marks it", () => {
    expect(assessReschedule(at(inHours(2)), NOW)).toMatchObject({ allowed: true, late: true });
  });

  it("refuses to move something that already started", () => {
    const v = assessReschedule(at(inHours(-1)), NOW);
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toMatch(/moved/);
  });
});

describe("hoursOfNotice", () => {
  it("is null without an agreed time", () => {
    expect(hoursOfNotice(null, NOW)).toBeNull();
  });

  it("counts forward and backward", () => {
    expect(hoursOfNotice(inHours(5), NOW)).toBeCloseTo(5);
    expect(hoursOfNotice(inHours(-3), NOW)).toBeCloseTo(-3);
  });
});

describe("describeNotice", () => {
  it("says minutes under an hour", () => {
    expect(describeNotice(0.5)).toBe("30 minutes");
  });

  it("says hours up to two days", () => {
    expect(describeNotice(5)).toBe("5 hours");
    expect(describeNotice(1)).toBe("1 hour");
  });

  it("says days beyond that", () => {
    expect(describeNotice(72)).toBe("3 days");
  });

  it("rounds DOWN, never up into looking like the window was met", () => {
    // 23.9 hours must not read as "24 hours" next to a late-cancellation notice.
    expect(describeNotice(23.9)).toBe("23 hours");
  });

  it("is null when there is no time to describe", () => {
    expect(describeNotice(null)).toBeNull();
  });
});
