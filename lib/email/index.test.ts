/// <reference types="vitest/globals" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("resend", () => ({ Resend: class { emails = { send: vi.fn() } } }));

import { isEmailConfigured, usesSandboxSender } from "./index";

const ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM = "VitaReBa <noreply@fleetcrown.orangecat.ch>";
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("usesSandboxSender", () => {
  it("recognises Resend's shared sandbox sender", () => {
    expect(usesSandboxSender("VitaReBa <onboarding@resend.dev>")).toBe(true);
    expect(usesSandboxSender("ONBOARDING@RESEND.DEV")).toBe(true);
  });

  it("accepts a real verified sender", () => {
    expect(usesSandboxSender("VitaReBa <noreply@fleetcrown.orangecat.ch>")).toBe(false);
  });

  // "resend.dev" must match as a domain, not as a substring of a real one.
  it("does not flag a lookalike domain", () => {
    expect(usesSandboxSender("VitaReBa <noreply@notresend.dev.example.ch>")).toBe(false);
  });
});

describe("isEmailConfigured", () => {
  it("is false without an API key", () => {
    delete process.env.RESEND_API_KEY;
    expect(isEmailConfigured()).toBe(false);
  });

  it("is true with a key and a real sender", () => {
    expect(isEmailConfigured()).toBe(true);
  });

  /**
   * The production incident this guards: the key was set and the API accepted
   * calls, so the app believed email worked — while Resend rejected every
   * recipient except the account owner. Password reset answered "check your
   * inbox" and no patient could ever get back in.
   */
  it("treats a sandbox sender in production as NOT configured", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.RESEND_FROM = "VitaReBa <onboarding@resend.dev>";
    expect(isEmailConfigured()).toBe(false);
    vi.unstubAllEnvs();
  });

  it("still allows the sandbox sender outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.RESEND_FROM = "VitaReBa <onboarding@resend.dev>";
    expect(isEmailConfigured()).toBe(true);
    vi.unstubAllEnvs();
  });
});
