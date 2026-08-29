/**
 * The SSRF guard.
 *
 * "The server fetches a URL the user typed" is the whole vulnerability class:
 * the request originates inside the box, so it reaches the database port, the
 * cloud metadata service, and every other app on the same host — none of which
 * the internet can reach. The attacker does not need to see a reply; a calendar
 * that "fails to parse" with 800 events has already answered the question.
 *
 * These tests are the closed side of that gate. It is easy to assert that a
 * normal https link is accepted, and useless — the failure is the address
 * nobody thought to write down. Every known way of spelling "inside" is here.
 */
/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import { isPublicAddress, normaliseCalendarUrl } from "./calendar-fetch";

describe("what counts as reachable from the internet", () => {
  it("accepts ordinary public addresses", () => {
    expect(isPublicAddress("1.1.1.1")).toBe(true);
    expect(isPublicAddress("142.250.185.78")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });

  it.each([
    ["127.0.0.1", "loopback"],
    ["127.1.2.3", "the rest of loopback, which people forget is a whole /8"],
    ["0.0.0.0", "this network"],
    ["10.0.0.5", "private"],
    ["172.16.0.1", "private, bottom of the range"],
    ["172.31.255.254", "private, top of the range"],
    ["192.168.1.1", "private"],
    ["169.254.169.254", "cloud metadata — credentials live here"],
    ["100.64.0.1", "carrier-grade NAT"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
  ])("refuses %s (%s)", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it("refuses the addresses just outside the private ranges too — but not beyond", () => {
    // Off-by-one in either direction is how a range check quietly fails.
    expect(isPublicAddress("172.15.0.1")).toBe(true);
    expect(isPublicAddress("172.32.0.1")).toBe(true);
    expect(isPublicAddress("11.0.0.1")).toBe(true);
    expect(isPublicAddress("9.255.255.255")).toBe(true);
  });

  it.each([
    ["::1", "IPv6 loopback"],
    ["::", "unspecified"],
    ["fe80::1", "link-local"],
    ["fd00::1", "unique local"],
    ["fc00::1", "unique local"],
    ["ff02::1", "multicast"],
    ["::ffff:127.0.0.1", "IPv4 loopback wearing IPv6 clothes"],
    ["::ffff:169.254.169.254", "metadata service wearing IPv6 clothes"],
  ])("refuses %s (%s)", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it("refuses anything that is not an address at all", () => {
    expect(isPublicAddress("localhost")).toBe(false);
    expect(isPublicAddress("")).toBe(false);
    expect(isPublicAddress("999.999.999.999")).toBe(false);
  });
});

describe("normalising what somebody pasted", () => {
  it("accepts an https calendar link", () => {
    const r = normaliseCalendarUrl(
      "https://calendar.google.com/calendar/ical/x/private-abc/basic.ics",
    );
    expect(r.ok).toBe(true);
  });

  it("turns webcal into https, because that is what it is", () => {
    // Apple and Google both hand out webcal://; refusing it would make the
    // feature look broken for the copy-paste everyone actually does.
    const r = normaliseCalendarUrl("webcal://p01.calendar.icloud.com/published/2/abc");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url.startsWith("https://")).toBe(true);
  });

  it("tolerates surrounding whitespace from a copy-paste", () => {
    expect(normaliseCalendarUrl("  https://example.com/cal.ics \n").ok).toBe(true);
  });

  it.each([
    ["http://example.com/cal.ics", "plain http would be readable in transit"],
    ["file:///etc/passwd", "the local filesystem"],
    ["gopher://example.com/", "a protocol used to smuggle other protocols"],
    ["ftp://example.com/cal.ics", "not a calendar transport"],
    ["javascript:alert(1)", "not a transport at all"],
  ])("refuses %s (%s)", (raw) => {
    expect(normaliseCalendarUrl(raw).ok).toBe(false);
  });

  it("refuses something that is not a link", () => {
    expect(normaliseCalendarUrl("my calendar").ok).toBe(false);
    expect(normaliseCalendarUrl("").ok).toBe(false);
  });

  it("explains itself in words the person can act on", () => {
    const r = normaliseCalendarUrl("http://example.com/cal.ics");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/https/i);
  });
});
