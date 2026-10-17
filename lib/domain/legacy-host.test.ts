/// <reference types="vitest/globals" />
import { legacyHostRedirect } from "./legacy-host";

describe("legacyHostRedirect", () => {
  it("moves a page on the old host to vita.orangecat.ch, keeping path and query", () => {
    expect(legacyHostRedirect("vitareba.orangecat.ch", "/de/programme", "?a=1")).toBe(
      "https://vita.orangecat.ch/de/programme?a=1",
    );
  });

  it("reads the first forwarded host and ignores a port and case", () => {
    expect(legacyHostRedirect("VitaReBa.orangecat.ch:443, proxy", "/")).toBe(
      "https://vita.orangecat.ch/",
    );
  });

  it("never moves the API: crons, calendar feeds and auth callbacks answer where they are", () => {
    expect(legacyHostRedirect("vitareba.orangecat.ch", "/api/cron/emails")).toBeNull();
    expect(
      legacyHostRedirect("vitareba.orangecat.ch", "/api/auth/callback/credentials"),
    ).toBeNull();
  });

  it("serves the canonical host and anything else in place", () => {
    expect(legacyHostRedirect("vita.orangecat.ch", "/de")).toBeNull();
    expect(legacyHostRedirect("localhost:3000", "/de")).toBeNull();
    expect(legacyHostRedirect(null, "/de")).toBeNull();
  });
});
