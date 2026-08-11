/// <reference types="vitest/globals" />
/**
 * Design-token discipline — CI teeth for the SSOT rule.
 *
 * All visual decisions live in app/globals.css :root as CSS custom properties.
 * This test makes drift impossible instead of aspirational:
 *
 *  1. No raw colors (hex / rgb / rgba / hsl) in any *.module.css — use the
 *     palette + opacity-scale vars.
 *  2. Every border-radius value in *.module.css is a var(--radius-*) or 0.
 *  3. Every transition duration in *.module.css is a var(--transition-*).
 *  4. No raw hex colors in TSX (className or style) — chart/OG contexts import
 *     from lib/config/theme.ts.
 *  5. style={{}} in TSX only in the allowlist below — files whose styles are
 *     data-driven (bar widths, config-sourced chart colors) and cannot live in
 *     CSS. Anything else belongs in a co-located .module.css.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components", "lib"];

/** TSX files where style={{}} is legitimately data-driven. */
const STYLE_PROP_ALLOWLIST = new Set([
  "app/(portal)/assessments/page.tsx", // score bar widths
  "app/(portal)/profile/ProfileForm.tsx", // completeness bar width
  "app/(portal)/goals/page.tsx", // goal progress bar width
  "app/(portal)/dashboard/ProfileCompletenessBar.tsx", // bar width
  "app/(portal)/dashboard/GoalsCard.tsx", // bar width
  "app/(admin)/admin/reports/page.tsx", // bar widths + signal colors from config
  "components/Assessment/index.tsx", // overlay progress bar width
  "components/Assessment/ResultsScreen.tsx", // score bar widths
  "components/admin/PatientGoalsCard.tsx", // baseline/target marker positions
  "lib/og/element.tsx", // Satori OG image — no CSS runtime exists there
]);

function collect(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry.startsWith(".")) return [];
    if (statSync(full).isDirectory()) return collect(full, ext);
    return entry.endsWith(ext) ? [full] : [];
  });
}

function offendingLines(file: string, test: (line: string) => boolean): string[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line, i) => (test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : []));
}

const cssModules = ["app", "components"].flatMap((r) => collect(r, ".module.css"));
const tsxFiles = ROOTS.flatMap((r) => collect(r, ".tsx"));

describe("design-token discipline", () => {
  it("finds files (sanity)", () => {
    expect(cssModules.length).toBeGreaterThan(10);
    expect(tsxFiles.length).toBeGreaterThan(20);
  });

  it("no raw colors in *.module.css — use palette/opacity-scale vars", () => {
    // hex inside a var() fallback is fine: var(--off, #f8f7f4)
    const stripVarFallbacks = (l: string) => l.replace(/var\([^)]*\)/g, "var()");
    const offenders = cssModules.flatMap((f) =>
      offendingLines(f, (l) => /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\(/.test(stripVarFallbacks(l))),
    );
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("border-radius uses var(--radius-*) tokens only", () => {
    const offenders = cssModules.flatMap((f) =>
      offendingLines(f, (l) => {
        const m = l.match(/border-radius\s*:\s*([^;]+);/);
        if (!m) return false;
        return m[1]
          .trim()
          .split(/\s+/)
          .some((v) => v !== "0" && !/^var\(--radius-[a-z0-9]+\)$/.test(v));
      }),
    );
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("transition durations use var(--transition-*) tokens only", () => {
    const offenders = cssModules.flatMap((f) =>
      offendingLines(
        f,
        (l) => /(^|[\s;{])transition(-duration|-delay)?\s*:/.test(l) && /\b\d*\.?\d+m?s\b/.test(l),
      ),
    );
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("no raw hex colors in TSX", () => {
    const offenders = tsxFiles
      .filter((f) => f !== join("lib", "og", "element.tsx"))
      .flatMap((f) => offendingLines(f, (l) => /["'`{[]#[0-9a-fA-F]{3,8}\b/.test(l)));
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("style={{}} only in the data-driven allowlist", () => {
    const allowed = new Set([...STYLE_PROP_ALLOWLIST].map((f) => join(f)));
    const offenders = tsxFiles
      .filter((f) => !allowed.has(f))
      .flatMap((f) => offendingLines(f, (l) => l.includes("style={{")));
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("every var(--x) referenced in a css module is defined in globals.css", () => {
    // next/font injects these at runtime via the root layout
    const runtimeVars = new Set(["--font-cormorant", "--font-dm-sans"]);
    const defined = new Set(
      [...readFileSync("app/globals.css", "utf8").matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map(
        (m) => m[1],
      ),
    );
    const offenders = cssModules.flatMap((f) =>
      offendingLines(f, (l) =>
        [...l.matchAll(/var\((--[a-z0-9-]+)/g)].some(
          (m) => !defined.has(m[1]) && !runtimeVars.has(m[1]),
        ),
      ),
    );
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("allowlist entries still exist (prune when a file drops its style prop)", () => {
    const stale = [...STYLE_PROP_ALLOWLIST].filter((f) => {
      try {
        return !readFileSync(join(f), "utf8").includes("style={{");
      } catch {
        return true; // file deleted
      }
    });
    expect(stale, `stale allowlist entries: ${stale.join(", ")}`).toEqual([]);
  });
});
