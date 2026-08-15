/**
 * Patient documents are medical records. Their bytes must only ever be reached
 * through the authenticated route (/api/documents/[id]/file), which checks who
 * is asking before it reads anything off disk.
 *
 * `documents.fileUrl` is a STORAGE LOCATION, not an authorised URL. It used to
 * be linked straight into the UI as /uploads/…, served by the web server with
 * no session involved — so anyone holding or guessing the URL could read a
 * patient's file forever, and the URL leaks through browser history, referrer
 * headers and forwarded email. Nothing was exposed only because no document
 * had been uploaded yet.
 *
 * This test fails if any component links the raw storage URL again.
 */
/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components"];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function collect(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry.startsWith(".")) return [];
    if (statSync(full).isDirectory()) return collect(full);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

const FILES = ROOTS.flatMap(collect);

describe("document storage discipline", () => {
  it("has files to scan", () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  it("no component links a document's raw storage URL", () => {
    const offenders = FILES.filter((file) =>
      /href=\{[^}]*\.fileUrl[^}]*\}/.test(stripComments(readFileSync(file, "utf8")))
    );
    expect(offenders, "link via documentFileUrl(doc.id) instead of doc.fileUrl").toEqual([]);
  });

  it("no source builds an /uploads/ link by hand", () => {
    const offenders = FILES.filter((file) =>
      /["'`]\/uploads\//.test(stripComments(readFileSync(file, "utf8")))
    );
    expect(offenders, "storage paths belong to lib/storage.ts").toEqual([]);
  });
});
