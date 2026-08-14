/// <reference types="vitest/globals" />
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

describe("calendar tokens", () => {
  const original = { auth: process.env.AUTH_SECRET, cron: process.env.CRON_SECRET };

  beforeAll(() => {
    process.env.AUTH_SECRET = "test-secret";
  });
  afterAll(() => {
    process.env.AUTH_SECRET = original.auth;
    process.env.CRON_SECRET = original.cron;
  });

  it("is stable for a user — a subscribed calendar must keep working", async () => {
    const { calendarToken } = await import("./calendar-token");
    expect(calendarToken(ID_A)).toBe(calendarToken(ID_A));
  });

  it("differs per user, so one feed URL never reveals another", async () => {
    const { calendarToken } = await import("./calendar-token");
    expect(calendarToken(ID_A)).not.toBe(calendarToken(ID_B));
  });

  it("accepts its own token and rejects everything else", async () => {
    const { calendarToken, verifyCalendarToken } = await import("./calendar-token");
    const token = calendarToken(ID_A);
    expect(verifyCalendarToken(ID_A, token)).toBe(true);
    expect(verifyCalendarToken(ID_B, token)).toBe(false);
    expect(verifyCalendarToken(ID_A, "")).toBe(false);
    expect(verifyCalendarToken(ID_A, token.slice(0, -1))).toBe(false);
    expect(verifyCalendarToken(ID_A, `${token}x`)).toBe(false);
  });

  it("rotating the secret invalidates every existing feed URL", async () => {
    const { calendarToken } = await import("./calendar-token");
    const before = calendarToken(ID_A);
    process.env.AUTH_SECRET = "rotated-secret";
    expect(calendarToken(ID_A)).not.toBe(before);
    process.env.AUTH_SECRET = "test-secret";
  });

  it("without a secret, verification fails closed rather than opening the feed", async () => {
    const { verifyCalendarToken, calendarToken } = await import("./calendar-token");
    const token = calendarToken(ID_A);
    delete process.env.AUTH_SECRET;
    delete process.env.CRON_SECRET;
    expect(verifyCalendarToken(ID_A, token)).toBe(false);
    process.env.AUTH_SECRET = "test-secret";
  });
});
