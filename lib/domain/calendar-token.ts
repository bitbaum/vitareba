/**
 * Calendar-feed authentication. Calendar clients (Google, Apple, Outlook)
 * cannot log in — they fetch a URL forever with no cookies — so the URL
 * itself has to carry proof. The token is an HMAC of the user id under the
 * server secret: unguessable, stable, verifiable with zero storage, and
 * revocable for everyone at once by rotating the secret.
 *
 * Deliberately NOT a stored column: a leaked feed URL exposes appointment
 * times for one clinician, so a rotatable derived secret beats a permanent
 * database token that also has to be migrated and backfilled.
 */

import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  const value = process.env.AUTH_SECRET ?? process.env.CRON_SECRET;
  if (!value) throw new Error("AUTH_SECRET (or CRON_SECRET) required for calendar tokens");
  return value;
}

export function calendarToken(userId: string): string {
  return createHmac("sha256", secret()).update(`calendar:${userId}`).digest("base64url").slice(0, 32);
}

export function verifyCalendarToken(userId: string, token: string): boolean {
  let expected: string;
  try {
    expected = calendarToken(userId);
  } catch {
    return false; // no secret configured → no feed, rather than an open one
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
