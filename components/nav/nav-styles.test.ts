/// <reference types="vitest/globals" />
/**
 * The nav contract, with teeth.
 *
 * NavSurfaces.tsx renders the portal's and the admin's navigation from one
 * piece of markup, painted with whichever CSS module the caller hands it. CSS
 * modules are typed as a plain string map, so `styles.bottomNavLabl` compiles
 * happily and ships `class="undefined"` — a nav item with no styling at all,
 * on one side of the product only, which is exactly the kind of thing nobody
 * notices until a patient does.
 *
 * So: every class name the shared renderer reads must exist in BOTH modules.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");

/** Comments stripped: prose about this very file mentions `styles.…` too. */
const SURFACES = readFileSync(join(__dirname, "NavSurfaces.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

/** Every `styles.foo` the shared renderer reads. */
const REQUIRED = [...SURFACES.matchAll(/\bstyles\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);

const MODULES = {
  portal: "app/(portal)/portal.module.css",
  admin: "app/(admin)/admin.module.css",
} as const;

function classNames(cssPath: string): Set<string> {
  const css = readFileSync(join(ROOT, cssPath), "utf8");
  return new Set([...css.matchAll(/\.([a-zA-Z][A-Za-z0-9_-]*)/g)].map((m) => m[1]));
}

describe("shared nav surfaces", () => {
  it("reads a non-trivial set of class names", () => {
    // Guards the regex itself: if it ever stops matching, the checks below
    // would pass vacuously and prove nothing.
    expect(new Set(REQUIRED).size).toBeGreaterThan(8);
  });

  for (const [name, path] of Object.entries(MODULES)) {
    it(`every class it reads is defined in ${name}.module.css`, () => {
      const defined = classNames(path);
      const missing = [...new Set(REQUIRED)].filter((c) => !defined.has(c));
      expect(missing).toEqual([]);
    });
  }

  it("keeps both nav surfaces on the shared renderer", () => {
    // The point of the consolidation was one definition, not a third one. If a
    // nav grows its own <nav> again, this fails and asks why.
    for (const file of ["components/admin/AdminNav.tsx", "components/portal/PortalNav.tsx"]) {
      const src = readFileSync(join(ROOT, file), "utf8");
      expect(src, `${file} re-rolls its own <nav>`).not.toMatch(/<nav\b/);
      expect(src, `${file} should render via NavSurfaces`).toMatch(/NavSidebar|NavBottomBar/);
    }
  });

  it("draws every nav glyph from the shared icon set", () => {
    // Seven icons were byte-identical copies across the two navs before this.
    for (const file of ["components/admin/AdminNav.tsx", "components/portal/PortalNav.tsx"]) {
      const src = readFileSync(join(ROOT, file), "utf8");
      expect(src, `${file} defines an inline SVG icon`).not.toMatch(/<svg\b/);
      expect(src).toMatch(/from "@\/components\/nav\/icons"/);
    }
  });
});
