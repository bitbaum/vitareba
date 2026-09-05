/**
 * WHICH PRACTICE IS THIS? — one answer, for the day there is more than one.
 *
 * `COMPANY` in lib/config/company.ts is still the source of this deployment's
 * identity, and that is deliberate rather than unfinished: the manifest, the
 * OG image and the sitemap are rendered at build time, where no database is
 * reachable. A clinic whose name only exists in a row cannot render its own
 * favicon. So the constant stays, the row is seeded FROM it (migration 0016),
 * and organization.test.ts fails if the two ever disagree.
 *
 * What the row buys is that `getOrganization()` is a function. Every one of the
 * ~109 `COMPANY.x` reads in this codebase is correct for a single-practice
 * deployment and none of them need to change today; when a second practice
 * arrives, the surfaces that must vary switch to this loader one at a time,
 * instead of the whole codebase switching at once. That is the difference
 * between a refactor and a rewrite, and it is the whole point of this file.
 *
 * This is the same lesson, one level up, that `clinicianLabelFor()` exists for:
 * a config constant naming one instance of a thing there will be several of.
 *
 * NOT a tenancy boundary. Two practices get two deployments and two databases
 * (see CLAUDE.md) — isolation no `WHERE` clause can forget. This file answers
 * "who are we", never "may this user see that row".
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { COMPANY, CLINIC_TIMEZONE } from "@/lib/config/company";

/** The practice this deployment serves. One per deployment, by design. */
export const DEFAULT_ORG_SLUG = "vita";

export type Organization = {
  slug: string;
  name: string;
  shortName: string;
  clinicianFallback: string;
  assistantName: string;
  partnerBrand: string | null;
  email: string;
  phone: string | null;
  addressStreet: string | null;
  addressZip: string | null;
  addressCity: string | null;
  timezone: string;
  foundingYear: number | null;
};

/**
 * This deployment's identity as the constant already describes it — the shape
 * migration 0016 seeds, expressed once so the seed and the fallback cannot
 * describe different things.
 */
export const BOOTSTRAP_ORGANIZATION: Organization = {
  slug: DEFAULT_ORG_SLUG,
  name: COMPANY.name,
  shortName: COMPANY.shortName,
  clinicianFallback: COMPANY.clinicianFallback,
  assistantName: COMPANY.assistantName,
  partnerBrand: COMPANY.partnerBrand,
  email: COMPANY.email,
  phone: COMPANY.phone,
  addressStreet: COMPANY.address.street,
  addressZip: COMPANY.address.zip,
  addressCity: COMPANY.address.city,
  timezone: CLINIC_TIMEZONE,
  foundingYear: COMPANY.foundingYear,
};

/**
 * The practice, from the database, falling back to the bootstrap identity.
 *
 * Never throws. A clinic's own name is chrome on every page and every email;
 * an unreachable database should degrade to the name we shipped with, not blank
 * a password-reset mail. The fallback is not a guess — it is the same value the
 * migration seeded, asserted equal by organization.test.ts.
 */
export async function getOrganization(slug: string = DEFAULT_ORG_SLUG): Promise<Organization> {
  try {
    const row = await db.query.organizations.findFirst({
      where: eq(organizations.slug, slug),
    });
    if (!row) return BOOTSTRAP_ORGANIZATION;
    return {
      slug: row.slug,
      name: row.name,
      shortName: row.shortName,
      clinicianFallback: row.clinicianFallback,
      assistantName: row.assistantName,
      partnerBrand: row.partnerBrand,
      email: row.email,
      phone: row.phone,
      addressStreet: row.addressStreet,
      addressZip: row.addressZip,
      addressCity: row.addressCity,
      timezone: row.timezone,
      foundingYear: row.foundingYear,
    };
  } catch {
    return BOOTSTRAP_ORGANIZATION;
  }
}
