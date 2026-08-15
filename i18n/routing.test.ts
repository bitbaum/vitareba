/**
 * A locale is a promise: the practice can serve a patient in that language.
 * These tests keep the promise and the files in step — a locale listed without
 * messages breaks at runtime, and messages left behind for a dropped locale
 * quietly invite it back.
 */
/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { routing } from "./routing";

const MESSAGES_DIR = join(process.cwd(), "messages");
const onDisk = readdirSync(MESSAGES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

describe("locale ↔ messages parity", () => {
  it("every routed locale has a message file", () => {
    expect([...routing.locales].sort()).toEqual(onDisk);
  });

  it("the default locale is one of the routed locales", () => {
    expect(routing.locales).toContain(routing.defaultLocale);
  });

  // vitareba.com commits to EN · DE · FR. Adding a locale here without the
  // practice being able to hold a consultation in it is a promise we break.
  it("serves exactly the languages the practice publishes", () => {
    expect([...routing.locales].sort()).toEqual(["de", "en", "fr"]);
  });

  it("every locale defines the same top-level sections", () => {
    const sections = (loc: string) =>
      Object.keys(JSON.parse(readFileSync(join(MESSAGES_DIR, `${loc}.json`), "utf8"))).sort();
    const reference = sections(routing.defaultLocale);
    for (const loc of routing.locales) {
      expect(sections(loc), `${loc}.json is missing sections`).toEqual(reference);
    }
  });
});
