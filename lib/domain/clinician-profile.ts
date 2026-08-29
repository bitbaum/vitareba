/**
 * A clinician's own settings — who they are (shown to patients) and when they
 * actually work (drives the slot engine, lib/domain/scheduling.ts).
 *
 * The row is OPTIONAL per clinician. Absence means "use DEFAULT_AVAILABILITY
 * and show no bio yet" — the same fallback the old hardcoded per-email config
 * object gave an unlisted clinician, now backed by a self-service row instead
 * of a source-code edit. A clinician who has never touched their settings is
 * still fully bookable on day one.
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clinicianProfiles, users } from "@/lib/db/schema";
import {
  DEFAULT_AVAILABILITY,
  type ClinicianAvailability,
  type WeeklyHours,
} from "@/lib/config/scheduling";
import {
  CLINICIAN_BIO_MAX_LENGTH,
  CLINICIAN_TITLE_MAX_LENGTH,
  CLINICIAN_SPECIALTY_MAX_LENGTH,
  CLINICIAN_SPECIALTIES_MAX_COUNT,
} from "@/lib/config/portal";
import { TIME_HHMM_RE } from "@/lib/utils/validate";

// ─── Validation ─────────────────────────────────────────────────────────────

const timeWindowSchema = z
  .tuple([z.string().regex(TIME_HHMM_RE), z.string().regex(TIME_HHMM_RE)])
  .refine(([start, end]) => start < end, { message: "A window's end must be after its start" });

/**
 * Object keys are always strings once this round-trips through JSON — "1".."7",
 * ISO weekday. partialRecord, not record: z.record with an enum/literal key
 * schema validates as an exhaustive Record (every key required) in this Zod
 * version — exactly wrong for a day that's closed and simply has no entry.
 */
const weeklyHoursSchema = z.partialRecord(
  z.enum(["1", "2", "3", "4", "5", "6", "7"]),
  z.array(timeWindowSchema).max(6),
);

export const clinicianProfileUpdateSchema = z.object({
  bio: z.string().max(CLINICIAN_BIO_MAX_LENGTH).nullable().optional(),
  title: z.string().max(CLINICIAN_TITLE_MAX_LENGTH).nullable().optional(),
  specialties: z
    .array(z.string().trim().min(1).max(CLINICIAN_SPECIALTY_MAX_LENGTH))
    .max(CLINICIAN_SPECIALTIES_MAX_COUNT)
    .optional(),
  weeklyHours: weeklyHoursSchema.optional(),
  slotMinutes: z.number().int().min(5).max(240).optional(),
  bufferMinutes: z.number().int().min(0).max(120).optional(),
  leadTimeHours: z.number().int().min(0).max(720).optional(),
  horizonDays: z.number().int().min(1).max(180).optional(),
  maxPerDay: z.number().int().min(1).max(48).optional(),
});

export type ClinicianProfileUpdate = z.infer<typeof clinicianProfileUpdateSchema>;

// ─── Reads ──────────────────────────────────────────────────────────────────

export type ClinicianProfileRow = {
  bio: string | null;
  title: string | null;
  specialties: string[];
  weeklyHours: WeeklyHours | null;
  slotMinutes: number | null;
  bufferMinutes: number | null;
  leadTimeHours: number | null;
  horizonDays: number | null;
  maxPerDay: number | null;
};

/** The raw row for self-service editing — nulls mean "not set, using defaults", shown as such rather than filled in with a guess. */
export async function getClinicianProfile(
  clinicianId: string,
): Promise<ClinicianProfileRow | null> {
  const row = await db.query.clinicianProfiles.findFirst({
    where: eq(clinicianProfiles.userId, clinicianId),
  });
  if (!row) return null;
  return {
    bio: row.bio,
    title: row.title,
    specialties: (row.specialties as string[] | null) ?? [],
    weeklyHours: (row.weeklyHours as WeeklyHours | null) ?? null,
    slotMinutes: row.slotMinutes,
    bufferMinutes: row.bufferMinutes,
    leadTimeHours: row.leadTimeHours,
    horizonDays: row.horizonDays,
    maxPerDay: row.maxPerDay,
  };
}

/**
 * The rules the slot engine uses for this clinician — DB row merged over
 * DEFAULT_AVAILABILITY, field by field. Replaces getAvailabilityForEmail's
 * `{ ...DEFAULT_AVAILABILITY, ...override }` spread with the same contract:
 * an unset field falls back to the default, not to a missing/undefined value.
 */
export async function getClinicianAvailability(
  clinicianId: string,
): Promise<ClinicianAvailability> {
  const row = await getClinicianProfile(clinicianId);
  if (!row) return DEFAULT_AVAILABILITY;
  return {
    weeklyHours: row.weeklyHours ?? DEFAULT_AVAILABILITY.weeklyHours,
    slotMinutes: row.slotMinutes ?? DEFAULT_AVAILABILITY.slotMinutes,
    bufferMinutes: row.bufferMinutes ?? DEFAULT_AVAILABILITY.bufferMinutes,
    leadTimeHours: row.leadTimeHours ?? DEFAULT_AVAILABILITY.leadTimeHours,
    horizonDays: row.horizonDays ?? DEFAULT_AVAILABILITY.horizonDays,
    maxPerDay: row.maxPerDay ?? DEFAULT_AVAILABILITY.maxPerDay,
  };
}

export type PublicClinicianProfile = {
  id: string;
  name: string | null;
  title: string | null;
  bio: string | null;
  specialties: string[];
  acceptingPatients: boolean;
  /** Working days/hours, clinic-timezone wall clock — transparency, not a booking guarantee (bookings are still confirmed against real-time availability). */
  weeklyHours: WeeklyHours;
};

/** What a patient may see about a clinician — never leadTimeHours/horizonDays/maxPerDay, which are booking-engine tuning, not identity. */
export async function getPublicClinicianProfile(
  clinicianId: string,
): Promise<PublicClinicianProfile | null> {
  const row = await db.query.users.findFirst({
    where: eq(users.id, clinicianId),
    columns: { id: true, name: true, isClinician: true },
    with: {
      profile: { columns: { acceptingPatients: true } },
      clinicianProfile: {
        columns: { bio: true, title: true, specialties: true, weeklyHours: true },
      },
    },
  });
  if (!row?.isClinician) return null;

  return {
    id: row.id,
    name: row.name,
    title: row.clinicianProfile?.title ?? null,
    bio: row.clinicianProfile?.bio ?? null,
    specialties: (row.clinicianProfile?.specialties as string[] | null) ?? [],
    acceptingPatients: row.profile?.acceptingPatients ?? true,
    weeklyHours:
      (row.clinicianProfile?.weeklyHours as WeeklyHours | null) ?? DEFAULT_AVAILABILITY.weeklyHours,
  };
}

// ─── Writes ─────────────────────────────────────────────────────────────────

/** Self-service only — upserts because the row is created lazily on first edit. */
export async function updateClinicianProfile(
  clinicianId: string,
  patch: ClinicianProfileUpdate,
): Promise<void> {
  await db
    .insert(clinicianProfiles)
    .values({ userId: clinicianId, ...patch })
    .onConflictDoUpdate({
      target: clinicianProfiles.userId,
      set: { ...patch, updatedAt: new Date() },
    });
}
