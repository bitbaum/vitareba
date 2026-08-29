/// <reference types="vitest/globals" />
/**
 * CSS module ordering — regression net.
 *
 * A mobile @media override loses to a base rule of equal specificity that
 * appears LATER in the file — silently: the admin stylesheet's entire mobile
 * block (stat grid, page title, form grids) was dead because the "Reports
 * page" section was appended after it. No tool flags this; the page just
 * renders desktop layout on phones.
 *
 * Rule: within a stylesheet, an @media block must come after every base
 * definition of a class it overrides. Simplest compliant layout: keep all
 * @media blocks at the end of the file.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components"];

function collectCssModules(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry.startsWith(".")) return [];
    if (statSync(full).isDirectory()) return collectCssModules(full);
    return entry.endsWith(".module.css") ? [full] : [];
  });
}

type Block = { startLine: number; classes: Set<string> };

function mediaBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("@media")) continue;
    let depth = 0;
    for (let j = i; j < lines.length; j++) {
      depth += (lines[j].match(/\{/g) ?? []).length;
      depth -= (lines[j].match(/\}/g) ?? []).length;
      if (depth === 0 && j > i) {
        const body = lines.slice(i, j + 1).join("\n");
        const classes = new Set([...body.matchAll(/\.([A-Za-z0-9_-]+)\s*[{,:]/g)].map((m) => m[1]));
        blocks.push({ startLine: i + 1, classes });
        i = j;
        break;
      }
    }
  }
  return blocks;
}

describe("css module @media ordering", () => {
  const files = ROOTS.flatMap((r) => collectCssModules(r));

  it("finds css modules (sanity)", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    it(`${file}: no base rule shadows an earlier @media override`, () => {
      const lines = readFileSync(file, "utf8").split("\n");
      const offenders: string[] = [];
      for (const block of mediaBlocks(lines)) {
        // any top-level (depth-0) selector for the same class after the block?
        let depth = 0;
        for (let ln = 0; ln < lines.length; ln++) {
          const isTopLevel = depth === 0;
          depth += (lines[ln].match(/\{/g) ?? []).length;
          depth -= (lines[ln].match(/\}/g) ?? []).length;
          if (ln + 1 <= block.startLine || !isTopLevel) continue;
          const m = lines[ln].match(/^\s*\.([A-Za-z0-9_-]+)\s*[{,]/);
          if (m && block.classes.has(m[1])) {
            offenders.push(
              `.${m[1]} defined at line ${ln + 1} AFTER the @media block at ` +
                `line ${block.startLine} that overrides it — the override is dead`,
            );
          }
        }
      }
      expect(offenders, offenders.join("\n")).toEqual([]);
    });
  }
});
