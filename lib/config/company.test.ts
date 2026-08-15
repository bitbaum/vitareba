/// <reference types="vitest/globals" />
import { getAdminEmails, PORTAL_URL, SITE_URL, DEFAULT_FROM_EMAIL } from "./company";

const ORIGINAL = process.env.ADMIN_EMAILS;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIGINAL;
});

describe("getAdminEmails", () => {
  it("returns an empty array when env var is unset", () => {
    delete process.env.ADMIN_EMAILS;
    expect(getAdminEmails()).toEqual([]);
  });

  it("returns an empty array when env var is empty", () => {
    process.env.ADMIN_EMAILS = "";
    expect(getAdminEmails()).toEqual([]);
  });

  it("parses a single email", () => {
    process.env.ADMIN_EMAILS = "manuel@example.com";
    expect(getAdminEmails()).toEqual(["manuel@example.com"]);
  });

  it("parses a comma-separated list", () => {
    process.env.ADMIN_EMAILS = "a@x.com,b@x.com,c@x.com";
    expect(getAdminEmails()).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
  });

  it("trims surrounding whitespace per entry", () => {
    process.env.ADMIN_EMAILS = " a@x.com , b@x.com ";
    expect(getAdminEmails()).toEqual(["a@x.com", "b@x.com"]);
  });

  it("filters out empty entries from trailing commas / double commas", () => {
    process.env.ADMIN_EMAILS = "a@x.com,,b@x.com,";
    expect(getAdminEmails()).toEqual(["a@x.com", "b@x.com"]);
  });

  it("lowercases entries (regression: case-mixed env should not double-email)", () => {
    process.env.ADMIN_EMAILS = "Manuel@X.com,manuel@x.com";
    expect(getAdminEmails()).toEqual(["manuel@x.com"]);
  });

  it("dedupes after lowercasing", () => {
    process.env.ADMIN_EMAILS = "a@x.com, A@X.com, a@x.com, b@x.com";
    expect(getAdminEmails()).toEqual(["a@x.com", "b@x.com"]);
  });

  it("preserves order of first occurrence", () => {
    process.env.ADMIN_EMAILS = "z@x.com,a@x.com,Z@x.com";
    expect(getAdminEmails()).toEqual(["z@x.com", "a@x.com"]);
  });
});

/**
 * Production incident, 2026-08-15: PORTAL_URL fell back to https://vitareba.ch,
 * a domain with no DNS delegation at all, and the deployed env set no
 * NEXT_PUBLIC_APP_URL — so the dead host was baked into the build in 41 places.
 * Every password reset link, reminder CTA and digest link pointed at a host
 * that does not exist. These invariants make the same mistake fail in CI.
 */
describe("deployment URL invariants", () => {
  const origin = (url: string) => new URL(url).origin;

  it("PORTAL_URL and SITE_URL are the same origin (one app, one host)", () => {
    expect(origin(PORTAL_URL)).toBe(origin(SITE_URL));
  });

  it("both are absolute https URLs", () => {
    for (const url of [PORTAL_URL, SITE_URL]) {
      expect(() => new URL(url)).not.toThrow();
      expect(new URL(url).protocol).toBe("https:");
    }
  });

  it("neither points at a host that is known not to resolve", () => {
    // vitareba.ch is not delegated. Remove it from this list on the day it is
    // live — and only then may the fallbacks move to it.
    const UNRESOLVED_HOSTS = ["vitareba.ch", "www.vitareba.ch"];
    for (const url of [PORTAL_URL, SITE_URL]) {
      expect(UNRESOLVED_HOSTS).not.toContain(new URL(url).hostname);
    }
  });

  it("the default sender is not a provider sandbox address", () => {
    expect(DEFAULT_FROM_EMAIL.toLowerCase()).not.toContain("@resend.dev");
  });
});
