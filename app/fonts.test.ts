/**
 * A build must not depend on a third party being reachable.
 *
 * `next/font/google` downloads font files AT BUILD TIME. Every build — CI, and
 * the production deploy on the box — then becomes a request to
 * fonts.gstatic.com, and shipping depends on Google answering from wherever the
 * build happens to run. That failed three times in one afternoon: twice on the
 * box mid-deploy and once on a GitHub runner. It surfaces as
 * "Module not found: @vercel/turbopack-next/internal/font/google/font", which
 * reads like a broken import and is really a failed download — so the person
 * who meets it goes looking in entirely the wrong place.
 *
 * The fonts are vendored. This keeps them that way, and checks the files are
 * really there and really fonts: a truncated or HTML-error-page "woff2" would
 * build perfectly and render the wrong typeface to every patient.
 */
/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const FONT_DIR = join(ROOT, "public/fonts");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry.startsWith(".")) return [];
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) && !entry.endsWith(".test.ts") ? [full] : [];
  });
}

describe("builds do not fetch fonts", () => {
  it("imports no font from next/font/google", () => {
    const offenders = ["app", "components", "lib"]
      .flatMap((d) => sourceFiles(join(ROOT, d)))
      .filter((f) => /from\s+["']next\/font\/google["']/.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(`${ROOT}/`, ""));

    expect(
      offenders,
      `${offenders.join(", ")} downloads fonts at build time — vendor the woff2 into public/fonts and use next/font/local`
    ).toEqual([]);
  });
});

describe("the vendored fonts are present and real", () => {
  const expected = [
    "CormorantGaramond-Light.woff2",
    "CormorantGaramond-Regular.woff2",
    "CormorantGaramond-LightItalic.woff2",
    "CormorantGaramond-Italic.woff2",
    "DMSans-Light.woff2",
    "DMSans-Regular.woff2",
    "DMSans-Medium.woff2",
  ];

  it.each(expected)("%s exists", (name) => {
    expect(() => statSync(join(FONT_DIR, name))).not.toThrow();
  });

  it.each(expected)("%s is a real woff2, not an error page", (name) => {
    // Google serves HTML on failure. An HTML file named .woff2 commits fine,
    // builds fine, and silently renders a fallback typeface to every patient.
    const buf = readFileSync(join(FONT_DIR, name));
    expect(buf.subarray(0, 4).toString("latin1"), `${name} is not woff2`).toBe("wOF2");
    expect(buf.length, `${name} is suspiciously small`).toBeGreaterThan(5_000);
  });

  it("every face the layout asks for is vendored", () => {
    // The layout is the source of truth for which faces exist; a path listed
    // there with no file is a build error, and a file with no path is dead weight.
    const layout = readFileSync(join(ROOT, "app/layout.tsx"), "utf8");
    const referenced = [...layout.matchAll(/public\/fonts\/([\w-]+\.woff2)/g)].map((m) => m[1]);
    expect(new Set(referenced)).toEqual(new Set(expected));
  });
});
