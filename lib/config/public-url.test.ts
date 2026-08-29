/**
 * A link we hand to a human must point at the host the human can reach.
 *
 * This app runs behind Caddy, which proxies to 127.0.0.1:4011. Inside the
 * process, the request's own URL is that internal address — so ANY user-facing
 * link built from `req.url`, `headers().get("host")`, or `X-Forwarded-Host`
 * points somewhere the recipient cannot go. The calendar subscription link did
 * exactly this and handed every clinician `https://localhost:4011/...`, which
 * fails silently on their machine, in their calendar app, days later.
 *
 * Nothing else could see it: it typechecks, it renders, it is a valid URL, and
 * no test renders a page. So the rule is enforced here, as a grep with teeth —
 * user-facing origins come from PORTAL_URL, which is configured and cannot be
 * set by a request.
 */
/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PORTAL_URL, SITE_URL } from "@/lib/config/company";

const ROOTS = ["app", "lib", "components"];

function collect(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry.startsWith(".")) return [];
    if (statSync(full).isDirectory()) return collect(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const FILES = ROOTS.flatMap((r) => collect(join(process.cwd(), r))).map((f) =>
  f.replace(`${process.cwd()}/`, ""),
);

/**
 * Ways of asking "what host am I on?" that answer with the INTERNAL one behind
 * a reverse proxy, or with something a caller can forge.
 */
const FORBIDDEN = [
  {
    pattern: /new URL\(\s*req(uest)?\.url\s*\)\.origin/,
    why: "req.url is the internal proxy target",
  },
  { pattern: /headers\(\)\.get\(\s*["']host["']\s*\)/, why: "Host is the proxy's host, or forged" },
  { pattern: /["']x-forwarded-host["']/i, why: "X-Forwarded-Host is attacker-controlled" },
  { pattern: /["']x-forwarded-proto["']/i, why: "X-Forwarded-Proto is attacker-controlled" },
];

/** This test names them, so it must not fail on itself. */
const SELF = "lib/config/public-url.test.ts";

/**
 * Read the CODE, not the prose. Without this the rule fires on the comment
 * explaining why the pattern is banned — punishing the one thing that stops the
 * next person reintroducing it.
 */
function codeOf(file: string): string {
  return readFileSync(join(process.cwd(), file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("user-facing links come from configuration, not the request", () => {
  it("scans a real set of files", () => {
    // A glob that silently matched nothing would make the rule below vacuous.
    expect(FILES.length).toBeGreaterThan(50);
  });

  it.each(FORBIDDEN)("never derives an origin via $why", ({ pattern, why }) => {
    const offenders = FILES.filter((f) => f !== SELF && pattern.test(codeOf(f)));
    expect(
      offenders,
      `${offenders.join(", ")} builds a URL from the request — ${why}. Use PORTAL_URL.`,
    ).toEqual([]);
  });
});

describe("the configured public origin is actually public", () => {
  it("is not a loopback or internal address", () => {
    for (const url of [PORTAL_URL, SITE_URL]) {
      expect(url, `${url} is not reachable by a patient`).not.toMatch(
        /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/,
      );
    }
  });

  it("names no port — a public site is on the default one", () => {
    // ":4011" leaking into a link is the exact shape of the bug this prevents.
    for (const url of [PORTAL_URL, SITE_URL]) {
      expect(new URL(url).port, `${url} carries an internal port`).toBe("");
    }
  });

  it("is https, since these links carry tokens", () => {
    for (const url of [PORTAL_URL, SITE_URL]) {
      expect(new URL(url).protocol).toBe("https:");
    }
  });
});
