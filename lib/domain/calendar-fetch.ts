/**
 * Fetching a URL somebody typed in.
 *
 * THIS IS THE DANGEROUS PART OF THE FEATURE, and it is dangerous in a way that
 * looks like nothing. "The server fetches a URL the user supplied" is the
 * definition of server-side request forgery: the request comes from inside the
 * box, so it reaches everything the box can reach and nothing outside can —
 * the Postgres port, the metadata service that hands out cloud credentials,
 * another app on the same host. The attacker never needs to see a reply; a
 * calendar that "fails to parse" with 800 events is already an answer.
 *
 * So a URL is only fetched when ALL of this holds, checked again on every
 * redirect hop because a public hostname is free to redirect to 127.0.0.1:
 *
 *   • the scheme is https (webcal:// is https wearing a different hat)
 *   • every address the hostname resolves to is publicly routable
 *   • the response is a bounded number of bytes, read with a timeout
 *
 * The address check happens after DNS resolution rather than on the hostname,
 * because "internal.example.com" is a public-looking name that resolves
 * wherever its owner likes.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  CALENDAR_FETCH_TIMEOUT_MS,
  CALENDAR_MAX_BYTES,
} from "@/lib/config/calendar-sync";

export type UrlProblem = { ok: false; error: string };
export type UrlOk = { ok: true; url: string };

/** Redirect hops followed before giving up. Calendar hosts use one or two. */
const MAX_REDIRECTS = 3;

/**
 * Normalise what a person pasted into something fetchable, or say why not.
 * `webcal://` is what Apple and Google hand out; it is https by another name.
 */
export function normaliseCalendarUrl(raw: string): UrlOk | UrlProblem {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Paste the calendar's secret address." };

  // Rewritten as TEXT, before parsing. `url.protocol = "https:"` looks like it
  // works and does nothing: the URL spec refuses to change a non-special scheme
  // (webcal) into a special one (https), silently leaving webcal in place — and
  // then fetch() cannot open it.
  const candidate = /^webcal:\/\//i.test(trimmed)
    ? `https://${trimmed.slice("webcal://".length)}`
    : trimmed;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: "That does not look like a link." };
  }

  if (url.protocol !== "https:") {
    return {
      ok: false,
      error: "Only https and webcal links are accepted — a plain http link would be readable in transit.",
    };
  }
  if (!url.hostname) return { ok: false, error: "That link has no address in it." };

  return { ok: true, url: url.toString() };
}

/**
 * True when an IP address is one the public internet can route to.
 *
 * Everything else — loopback, private ranges, link-local (which is where cloud
 * metadata services live), carrier-grade NAT, unique-local IPv6 — is somewhere
 * only this machine or this network can reach, and therefore somewhere a
 * calendar cannot be.
 */
export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const p = address.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  if (a === 0) return false;                     // "this network"
  if (a === 10) return false;                    // private
  if (a === 127) return false;                   // loopback
  if (a === 169 && b === 254) return false;      // link-local — cloud metadata lives here
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false;      // private
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 192 && b === 0) return false;        // IETF protocol assignments
  if (a >= 224) return false;                    // multicast and reserved
  return true;
}

function isPublicIpv6(address: string): boolean {
  const a = address.toLowerCase();
  if (a === "::" || a === "::1") return false;           // unspecified, loopback
  if (a.startsWith("fe80")) return false;                // link-local
  if (a.startsWith("fc") || a.startsWith("fd")) return false; // unique local
  if (a.startsWith("ff")) return false;                  // multicast
  // ::ffff:127.0.0.1 — an IPv4 address in IPv6 clothing, and a classic bypass.
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIpv4(mapped[1]);
  return true;
}

/** Every address this hostname resolves to must be public, not merely the first. */
export async function hostIsPublic(hostname: string): Promise<boolean> {
  // A literal address skips DNS and is checked directly.
  if (isIP(hostname)) return isPublicAddress(hostname);
  try {
    const results = await lookup(hostname, { all: true });
    if (results.length === 0) return false;
    return results.every((r) => isPublicAddress(r.address));
  } catch {
    return false;
  }
}

export type FetchResult = { ok: true; text: string } | { ok: false; error: string };

/**
 * Fetch a calendar document, refusing anything that points inward.
 *
 * Redirects are followed by hand rather than by the runtime, because the only
 * way to check every hop is to see every hop — a host that passes the first
 * check is free to redirect to localhost.
 */
export async function fetchCalendarText(rawUrl: string): Promise<FetchResult> {
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const normalised = normaliseCalendarUrl(current);
    if (!normalised.ok) return normalised;

    const url = new URL(normalised.url);
    if (!(await hostIsPublic(url.hostname))) {
      return { ok: false, error: "That address is not reachable from the public internet." };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CALENDAR_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "text/calendar, text/plain;q=0.8, */*;q=0.5" },
      });
    } catch {
      return { ok: false, error: "Could not reach that calendar." };
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return { ok: false, error: "That calendar redirected to nowhere." };
      current = new URL(location, url).toString();
      continue;
    }

    if (!res.ok) {
      return {
        ok: false,
        error:
          res.status === 401 || res.status === 403
            ? "That calendar refused us — check the link is the secret/private one."
            : `That calendar answered ${res.status}.`,
      };
    }

    // Trust the declared length when it is there, and cap the read regardless:
    // a server is free to lie about it, or omit it entirely.
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > CALENDAR_MAX_BYTES) {
      return { ok: false, error: "That calendar is too large to read." };
    }
    const text = await readCapped(res);
    if (text === null) return { ok: false, error: "That calendar is too large to read." };
    if (!text.includes("BEGIN:VCALENDAR")) {
      return { ok: false, error: "That link did not return a calendar." };
    }
    return { ok: true, text };
  }

  return { ok: false, error: "That calendar redirected too many times." };
}

/** Read the body, stopping the moment it exceeds the cap. */
async function readCapped(res: Response): Promise<string | null> {
  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    return text.length > CALENDAR_MAX_BYTES ? null : text;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > CALENDAR_MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(concat(chunks, total));
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
