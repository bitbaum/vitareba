import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  numeric,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["patient", "admin"]);
// What kind of thing is speaking in a thread. Descriptive only — never consulted
// to decide who may read or write. An `ai` participant is deliberately NOT a
// users row: giving the assistant an account is how a model ends up with a login.
export const actorKindEnum = pgEnum("actor_kind", ["human", "ai", "system"]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "attended",
  "cancelled",
]);
export const exerciseFrequencyEnum = pgEnum("exercise_frequency", [
  "none",
  "light",
  "moderate",
  "regular",
  "intense",
]);
export const programmeEnum = pgEnum("programme", [
  "edge_diagnostic",
  "riding_the_wave",
  "total_longevity",
]);
export const programmePhaseEnum = pgEnum("programme_phase", [
  "intake",
  "assessment",
  "planning",
  "active",
  "review",
  "completed",
]);
export const emailQueueStatusEnum = pgEnum("email_queue_status", [
  "pending",
  "sent",
  "failed",
]);
export const bookingTypeEnum = pgEnum("booking_type", [
  "consultation",
  "machine",
]);
export const biologicalSexEnum = pgEnum("biological_sex", [
  "female",
  "male",
  "unspecified",
]);
export const machineTypeEnum = pgEnum("machine_type", [
  "h2_therapy",
  "ihht",
  "pemf",
  "infrared",
  "hrv_biofeedback",
]);
export const clinicianApplicationStatusEnum = pgEnum("clinician_application_status", [
  "pending",
  "approved",
  "declined",
]);

// ─── Auth tables (required by NextAuth DrizzleAdapter) ───────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  password: text("password"),
  role: roleEnum("role").notNull().default("patient"),
  // Marks actual doctors (distinct from role=admin, which is ACCESS level —
  // a user can be clinician AND someone's patient; George is both by design).
  isClinician: boolean("is_clinician").notNull().default(false),
  // Brute-force protection: count of consecutive failed login attempts.
  // Resets to 0 on successful login or when a lockout is triggered.
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  // While set in the future, all login attempts are denied even with the correct password.
  lockedUntil: timestamp("locked_until", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

// ─── Patient profile ──────────────────────────────────────────────────────────

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  // Contact & basics
  phone: varchar("phone", { length: 50 }),
  dateOfBirth: varchar("date_of_birth", { length: 20 }),
  // Recorded for ONE purpose: picking the right reference interval for ferritin,
  // haemoglobin, testosterone, creatinine, waist and the transaminases, which
  // genuinely differ. Not an identity field, never displayed as one, and
  // "unspecified" is a real answer — the UI then says the interval is not
  // sex-specific instead of guessing. See lib/config/measurements.ts.
  biologicalSex: biologicalSexEnum("biological_sex"),
  city: varchar("city", { length: 100 }),
  occupation: varchar("occupation", { length: 150 }),
  // Clinical context
  mainConcern: text("main_concern"),
  goals: text("goals"),
  diagnosisHistory: text("diagnosis_history"),
  currentMedications: text("current_medications"),
  currentSupplements: text("current_supplements"),
  // Lifestyle baselines
  sleepHoursAvg: integer("sleep_hours_avg"),
  exerciseFrequency: exerciseFrequencyEnum("exercise_frequency"),
  // Meta
  referralSource: text("referral_source"),
  notes: text("notes"),
  digestOptOut: boolean("digest_opt_out").notNull().default(false),
  reminderOptOut: boolean("reminder_opt_out").notNull().default(false),
  // Meaningful only when users.isClinician is true — whether this clinician is
  // taking on NEW patients right now. Self-service: a clinician sets their own,
  // nobody sets it for them. Defaults true so a fresh clinician account is
  // bookable immediately, and a patient with no profile row yet (the column
  // lives on `profiles`, which is created lazily) still reads as accepting.
  // Never hides a clinician from a patient who already has a relationship with
  // them — closing intake protects a calendar from NEW patients, not existing
  // ones mid-treatment.
  acceptingPatients: boolean("accepting_patients").notNull().default(true),
  // Signal tracking (updated by cron/signals, used to detect critical transitions)
  lastKnownSignal: varchar("last_known_signal", { length: 20 }),
  criticalAlertSentAt: timestamp("critical_alert_sent_at", { mode: "date" }),
  dipAlertSentAt: timestamp("dip_alert_sent_at", { mode: "date" }),
  // Updated when patient opens the goals page — drives "new goals" badge in nav
  goalsSeenAt: timestamp("goals_seen_at", { mode: "date" }),
  // Updated when an admin/clinician opens /admin/bookings — drives the admin
  // nav's "new bookings" badge. Without this, a native slot booking (born
  // status=confirmed, never "pending") produced zero visible signal anywhere
  // in the clinician's UI — the exact gap that meant a booked appointment
  // went unnoticed until someone happened to open the page.
  bookingsSeenAt: timestamp("bookings_seen_at", { mode: "date" }),
  // Explicit consent to AI processing of clinical data (GDPR Art. 9(2)(a) /
  // revFADP). Null = not consented; AI routes refuse without it.
  aiConsentAt: timestamp("ai_consent_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// ─── Daily check-ins ──────────────────────────────────────────────────────────

export const dailyCheckins = pgTable(
  "daily_checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
    sleep: integer("sleep").notNull(),   // 1–5
    energy: integer("energy").notNull(), // 1–5
    mood: integer("mood").notNull(),     // 1–5
    focus: integer("focus").notNull(),   // 1–5
    stress: integer("stress").notNull(), // 1–5 (1 = very low, 5 = very high)
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("daily_checkins_user_date_idx").on(t.userId, t.date)]
);

// ─── Clinical measurements ────────────────────────────────────────────────────

/**
 * One measured number, at one point in time. Labs, vitals and wearable readings
 * all land here — the thing a clinician actually watches is a value moving, and
 * a value can only move if it is stored as a value rather than as a PDF.
 *
 * `kind` is a varchar, not a pgEnum, on purpose: lib/config/measurements.ts is
 * the single source of truth for which markers exist, and a new marker must not
 * require a migration. The API validates `kind` against that config, and
 * lib/config/measurements.test.ts keeps the two honest.
 *
 * The UNIT IS NOT STORED — it belongs to the kind, and storing it would create a
 * second truth that could disagree with the config. The rule that makes this
 * safe: a kind's unit is immutable. Reporting a marker in a different unit means
 * adding a new kind, never editing an existing one, or every historical value
 * silently changes meaning.
 */
export const measurements = pgTable(
  "measurements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 50 }).notNull(),
    // numeric, not float: a lab value is a decimal quantity, and 1.7 must come
    // back as 1.7. mode "number" keeps arithmetic (deltas, averages) in JS.
    value: numeric("value", { precision: 12, scale: 4, mode: "number" }).notNull(),
    // WHEN THE SAMPLE WAS TAKEN — not when someone typed it in. A lab report
    // entered three weeks late must sit at its own date on the chart, or the
    // trend is a fiction. createdAt records the typing.
    measuredAt: timestamp("measured_at", { mode: "date" }).notNull(),
    source: varchar("source", { length: 20 }).notNull(),
    // Provenance, not ownership — same reasoning as documents.uploadedBy and
    // thread_messages.senderId. A PATIENT records their own vitals, so NO ACTION
    // here would veto erasing almost every patient. SET NULL keeps the value in
    // the record when the clinician who entered it leaves.
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    // Every read is "this patient, this marker, newest first".
    index("measurements_patient_kind_idx").on(t.patientId, t.kind, t.measuredAt),
  ]
);

// ─── Assessments ──────────────────────────────────────────────────────────────

export const assessmentResults = pgTable("assessment_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  scores: jsonb("scores").notNull(),
  overallScore: integer("overall_score").notNull(),
  completedAt: timestamp("completed_at", { mode: "date" }).notNull().defaultNow(),
  /**
   * Which instrument produced this result. Only one exists today (the
   * Inflection Edge — lib/assessment/data.ts) so every existing row defaults
   * here unchanged. A second assessment is then an additive value on this
   * column, not a breaking migration or a second results table.
   */
  assessmentType: text("assessment_type").notNull().default("inflection_edge"),
});

// ─── Bookings ─────────────────────────────────────────────────────────────────

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: bookingStatusEnum("status").notNull().default("pending"),
    bookingType: bookingTypeEnum("booking_type").notNull().default("consultation"),
    machineType: machineTypeEnum("machine_type"),
    preferredDate: varchar("preferred_date", { length: 50 }),
    // Which doctor the appointment is with. Null = legacy/clinic-wide rows;
    // the slot engine treats those as busy for EVERY clinician (conservative).
    // SET NULL: removing a clinician must not delete a patient's booking, and
    // must not be blocked by it — the row degrades to a clinic-wide booking.
    clinicianId: uuid("clinician_id").references(() => users.id, { onDelete: "set null" }),
    // Exact slot start for portal-scheduled appointments (null = manual request
    // without a fixed time). The partial unique index below makes double-
    // booking a clinician's slot impossible at the DB level — the API's
    // conflict re-check can race, this cannot.
    scheduledAt: timestamp("scheduled_at", { mode: "date" }),
    notes: text("notes"),
    /**
     * Calendar version. A subscribed calendar only applies an update when
     * SEQUENCE grows, so every change that alters the appointment — confirming,
     * moving, cancelling — increments this. It used to be derived from the
     * status, which meant RESCHEDULING was invisible: the time changed, the
     * status did not, the sequence did not, and the patient's calendar kept
     * showing the old slot forever.
     */
    revision: integer("revision").notNull().default(0),
    /** The time this appointment was moved FROM, kept so the record shows it moved. */
    rescheduledFrom: timestamp("rescheduled_from", { mode: "date" }),
    cancelledAt: timestamp("cancelled_at", { mode: "date" }),
    // Who cancelled — a patient withdrawing and a clinic cancelling are
    // different events that must not look identical in the record. SET NULL for
    // the same reason as every other authorship column here: removing a
    // clinician must never delete or block a patient's booking history.
    cancelledBy: uuid("cancelled_by").references(() => users.id, { onDelete: "set null" }),
    cancellationReason: text("cancellation_reason"),
    /**
     * Whether this cancellation fell inside the notice window.
     *
     * STORED, not derived, and deliberately so: it is a judgement made at one
     * moment against the policy in force at that moment. Re-deriving it later
     * against a changed notice window would silently rewrite whether a patient
     * did the right thing two years ago.
     */
    lateCancellation: boolean("late_cancellation").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bookings_clinician_slot_idx")
      .on(t.clinicianId, t.scheduledAt)
      .where(sql`${t.status} IN ('pending', 'confirmed') AND ${t.scheduledAt} IS NOT NULL`),
  ]
);

// ─── Clinician profile & availability ──────────────────────────────────────────
// A clinician's own settings: who they are (shown to patients) and when they
// actually work (drives the slot engine — lib/domain/scheduling.ts). Replaces
// a hardcoded per-email object in lib/config/scheduling.ts that a developer had
// to edit in source to change; one clinician's "hours" there were explicitly a
// placeholder ("evenings-and-Friday product-testing window"), not real
// availability, and every patient booking against it was offered fake times.
//
// Row is OPTIONAL per clinician: absence means "use DEFAULT_AVAILABILITY",
// exactly as the old per-email override map defaulted an unlisted clinician —
// same fallback contract, now self-service instead of a source edit.

export const clinicianProfiles = pgTable("clinician_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  bio: text("bio"),
  title: varchar("title", { length: 150 }), // e.g. "MD, General Practitioner"
  specialties: jsonb("specialties").notNull().default([]), // string[]
  /** ISO weekday (1=Mon…7=Sun) → working windows [start,end) as "HH:MM". Mirrors ClinicianAvailability.weeklyHours. */
  weeklyHours: jsonb("weekly_hours"),
  slotMinutes: integer("slot_minutes"),
  bufferMinutes: integer("buffer_minutes"),
  leadTimeHours: integer("lead_time_hours"),
  horizonDays: integer("horizon_days"),
  maxPerDay: integer("max_per_day"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// ─── Clinician applications ─────────────────────────────────────────────────────
// Becoming a clinician is not a signup checkbox. Every account starts as a
// patient; this is the audit trail of who asked to treat patients, why, and
// who at the clinic said yes or no — kept separate from clinicianProfiles so
// re-applying after a decline doesn't fight over one row's status field.

export const clinicianApplications = pgTable("clinician_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  message: text("message").notNull(), // credentials / why they should treat patients
  status: clinicianApplicationStatusEnum("status").notNull().default("pending"),
  reviewNote: text("review_note"), // admin's reason, shown back to the applicant
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// ─── Care team ────────────────────────────────────────────────────────────────
// Who treats whom. Symmetric pairs are allowed (Manuel treats George, George
// treats Manuel) — that is the point: clinicians can be each other's patients.

export const careTeam = pgTable(
  "care_team",
  {
    clinicianId: uuid("clinician_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.clinicianId, t.patientId] })]
);

// ─── External calendars ───────────────────────────────────────────────────────

/**
 * A clinician's own calendar, subscribed to read-only.
 *
 * Every calendar app publishes a private "secret address in iCal format" URL.
 * Pointing at one is how a school run, a conference or a dentist stops this
 * platform from offering that hour to a patient — with no OAuth application, no
 * vendor to depend on, and nothing to pay. It works identically for Google,
 * Apple, Outlook and anything else that speaks iCalendar.
 *
 * READ-ONLY BY CONSTRUCTION. Nothing here can write to anyone's calendar.
 * Vita appointments travel the other way, through the .ics invites already
 * attached to confirmation emails.
 */
export const clinicianCalendars = pgTable("clinician_calendars", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicianId: uuid("clinician_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** What the clinician calls it — "Personal", "Hospital rota". */
  label: text("label").notNull(),
  /**
   * THE SECRET URL. Anyone holding it can read that person's whole calendar, so
   * it is never returned to the browser (the API answers with a masked form) and
   * never logged. Stored rather than hashed because fetching needs the original;
   * the protection is that it leaves the database only to be fetched.
   */
  icsUrl: text("ics_url").notNull(),
  active: boolean("active").notNull().default(true),
  lastFetchedAt: timestamp("last_fetched_at", { mode: "date" }),
  /** Why the last fetch failed, in words, so a broken feed is visible not silent. */
  lastError: text("last_error"),
  /** Busy intervals found at the last successful fetch. */
  lastEventCount: integer("last_event_count"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * Busy time read from an external calendar, cached.
 *
 * Cached rather than fetched during slot generation, for two reasons that both
 * matter: a network call on every page load makes the picker slow, and a
 * calendar host that is down or rate-limiting would otherwise make the clinic
 * look completely free. A stale cache offers one slot that is actually taken;
 * no cache at all offers EVERY slot that is actually taken.
 */
export const calendarBusy = pgTable(
  "calendar_busy",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => clinicianCalendars.id, { onDelete: "cascade" }),
    // Denormalised from the calendar so slot generation never has to join.
    clinicianId: uuid("clinician_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Times only. No title, no guests, no description — the clinic needs to know
    // that an hour is taken, never what its doctor is doing in it.
    startsAt: timestamp("starts_at", { mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { mode: "date" }).notNull(),
  },
  (t) => [index("calendar_busy_clinician_idx").on(t.clinicianId, t.startsAt)]
);

// ─── Documents ────────────────────────────────────────────────────────────────

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Provenance, not ownership. Nullable + SET NULL so the two deletions that
  // must work both do: erasing the PATIENT removes the document via the
  // userId cascade, while removing the UPLOADER (a clinician who leaves) must
  // leave the patient's record intact rather than deleting their documents.
  // With NO ACTION here, a patient who ever uploaded a file could not be
  // deleted at all — which broke the erasure the product promises.
  uploadedBy: uuid("uploaded_by")
    .references(() => users.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  fileUrl: text("file_url").notNull(),
  mimeType: varchar("mime_type", { length: 100 }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// ─── Messaging ────────────────────────────────────────────────────────────────

export const threads = pgTable("threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Who the thread is addressed to. NULLABLE by necessity: threads opened
  // before multi-clinician care have no addressee, and a patient nobody treats
  // yet must still be able to reach the clinic (falls back to all admins).
  // SET NULL: if that clinician leaves, the patient's thread must survive and
  // fall back to the clinic, not vanish or block the clinician's removal.
  clinicianId: uuid("clinician_id").references(() => users.id, { onDelete: "set null" }),
  subject: text("subject").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at", { mode: "date" }).notNull().defaultNow(),
});

export const threadMessages = pgTable("thread_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => threads.id, { onDelete: "cascade" }),
  // Nullable + SET NULL, unlike the other authorship columns: a PATIENT is a
  // sender too, so NO ACTION here vetoed erasing any patient who had ever sent
  // a message — which is nearly all of them. Erasing a patient still removes
  // their messages (threads cascade on patientId, messages on threadId); the
  // null case only arises for a deleted clinician's replies in a thread that
  // survives, where keeping the text with an unknown author beats deleting a
  // patient's clinical history.
  senderId: uuid("sender_id").references(() => users.id, { onDelete: "set null" }),
  // The author as an *actor*, which is a superset of "a user". Backfilled from
  // sender_id. This is the SSOT for authorship going forward; sender_id is kept
  // only for its FK erasure semantics and is dropped in a later, deliberate
  // migration (dropping a column is destructive and aborts the deploy by design).
  authorActorId: uuid("author_actor_id"),
  authorKind: actorKindEnum("author_kind").notNull().default("human"),
  // Set iff a model wrote this, so the clinical record can say so honestly.
  generatedByModel: text("generated_by_model"),
  body: text("body").notNull(),
  // DEPRECATED: read state belongs to a (person, thread) pair, not to a message.
  // A flag here means the first reader clears the badge for everyone — invisible
  // with two participants, wrong with three. Superseded by
  // thread_participants.last_read_at; retained until the column can be dropped.
  readAt: timestamp("read_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * Who is in a thread — the SSOT for message authorization.
 *
 * Replaces "the patient owns it, and any admin may read it", which is correct
 * only while the clinic has exactly one clinician. Access is now membership in
 * this table; no role grants it.
 */
export const threadParticipants = pgTable(
  "thread_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    // Deliberately NOT a foreign key to users: an AI participant is an actor
    // without an account, and forcing it to be a user row would give it one.
    actorId: uuid("actor_id").notNull(),
    kind: actorKindEnum("kind").notNull().default("human"),
    // Domain label for the UI ('patient', 'clinician', 'assistant', 'observer').
    // Never used to grant access.
    role: text("role"),
    joinedAt: timestamp("joined_at", { mode: "date" }).notNull().defaultNow(),
    // Set when someone leaves: they keep what they saw, and receive nothing after.
    leftAt: timestamp("left_at", { mode: "date" }),
    // Earliest message this participant may read. Defaults to when they joined,
    // so adding a second clinician does not silently disclose the backlog.
    visibleFrom: timestamp("visible_from", { mode: "date" }).notNull().defaultNow(),
    canWrite: boolean("can_write").notNull().default(true),
    // Per-participant read high-water mark — one row per person, not per message.
    lastReadAt: timestamp("last_read_at", { mode: "date" }),
  },
  (t) => [uniqueIndex("thread_participants_thread_actor_idx").on(t.threadId, t.actorId)]
);

// ─── Admin notes ──────────────────────────────────────────────────────────────

export const patientNotes = pgTable("patient_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  adminId: uuid("admin_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// ─── Programme assignments ────────────────────────────────────────────────────

export const programmeAssignments = pgTable("programme_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  programme: programmeEnum("programme").notNull(),
  phase: programmePhaseEnum("phase").notNull(),
  startDate: varchar("start_date", { length: 10 }), // YYYY-MM-DD, nullable = TBD
  notes: text("notes"),
  assignedBy: uuid("assigned_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// ─── Clinical goals ───────────────────────────────────────────────────────────

export const clinicalGoals = pgTable("clinical_goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  setByAdminId: uuid("set_by_admin_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  metric: varchar("metric", { length: 50 }),   // e.g. "focus", "overallScore", "mood" — optional
  baseline: integer("baseline"),               // 0–100 reading at intake
  target: integer("target"),                   // 0–100 goal
  current: integer("current"),                 // 0–100 most recent reading
  notes: text("notes"),
  completedAt: timestamp("completed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// ─── Email queue ──────────────────────────────────────────────────────────────

export const emailQueue = pgTable("email_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  templateKey: varchar("template_key", { length: 100 }).notNull(),
  sendAt: timestamp("send_at", { mode: "date" }).notNull(),
  sentAt: timestamp("sent_at", { mode: "date" }),
  status: emailQueueStatusEnum("status").notNull().default("pending"),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// ─── Assessment leads (anonymous overlay completions for conversion tracking) ──

export const assessmentLeads = pgTable("assessment_leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  overallScore: integer("overall_score").notNull(),
  // Nullable FK — set when the visitor later registers and saves their results
  convertedUserId: uuid("converted_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  convertedAt: timestamp("converted_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
  assessmentResults: many(assessmentResults),
  bookings: many(bookings, { relationName: "patient_bookings" }),
  clinicianBookings: many(bookings, { relationName: "clinician_bookings" }),
  patientsTreated: many(careTeam, { relationName: "care_team_clinician" }),
  clinicians: many(careTeam, { relationName: "care_team_patient" }),
  documents: many(documents, { relationName: "patient_documents" }),
  threads: many(threads, { relationName: "patient_threads" }),
  clinicianThreads: many(threads, { relationName: "clinician_threads" }),
  sentMessages: many(threadMessages),
  dailyCheckins: many(dailyCheckins),
  patientNotes: many(patientNotes, { relationName: "patient_notes" }),
  adminNotes: many(patientNotes, { relationName: "admin_notes" }),
  programmeAssignment: one(programmeAssignments, {
    fields: [users.id],
    references: [programmeAssignments.patientId],
    relationName: "patient_programme",
  }),
  clinicalGoals: many(clinicalGoals, { relationName: "patient_goals" }),
  measurements: many(measurements, { relationName: "patient_measurements" }),
  calendars: many(clinicianCalendars, { relationName: "clinician_calendars" }),
  calendarBusy: many(calendarBusy, { relationName: "clinician_busy" }),
  recordedMeasurements: many(measurements, { relationName: "recorded_measurements" }),
  emailQueue: many(emailQueue),
  assessmentLeads: many(assessmentLeads),
  clinicianProfile: one(clinicianProfiles, { fields: [users.id], references: [clinicianProfiles.userId] }),
  clinicianApplications: many(clinicianApplications, { relationName: "applicant" }),
  reviewedApplications: many(clinicianApplications, { relationName: "reviewer" }),
}));

export const clinicianProfilesRelations = relations(clinicianProfiles, ({ one }) => ({
  user: one(users, { fields: [clinicianProfiles.userId], references: [users.id] }),
}));

export const clinicianApplicationsRelations = relations(clinicianApplications, ({ one }) => ({
  user: one(users, { fields: [clinicianApplications.userId], references: [users.id], relationName: "applicant" }),
  reviewer: one(users, { fields: [clinicianApplications.reviewedBy], references: [users.id], relationName: "reviewer" }),
}));

// Reverse relation for users.assessmentResults `many`. Without it Drizzle's
// relational query builder can't infer the FK and throws "not enough
// information to infer relation users.assessmentResults" — which 500'd every
// DB-touching cron (signals / check-in-reminder / weekly-digest) silently in
// prod. Any `many` needs its matching `one` on the other table.
export const assessmentResultsRelations = relations(assessmentResults, ({ one }) => ({
  user: one(users, { fields: [assessmentResults.userId], references: [users.id] }),
}));

export const dailyCheckinsRelations = relations(dailyCheckins, ({ one }) => ({
  user: one(users, { fields: [dailyCheckins.userId], references: [users.id] }),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  user: one(users, {
    fields: [bookings.userId],
    references: [users.id],
    relationName: "patient_bookings",
  }),
  clinician: one(users, {
    fields: [bookings.clinicianId],
    references: [users.id],
    relationName: "clinician_bookings",
  }),
}));

export const careTeamRelations = relations(careTeam, ({ one }) => ({
  clinician: one(users, {
    fields: [careTeam.clinicianId],
    references: [users.id],
    relationName: "care_team_clinician",
  }),
  patient: one(users, {
    fields: [careTeam.patientId],
    references: [users.id],
    relationName: "care_team_patient",
  }),
}));

// documents ↔ users is DOUBLY connected (owner + uploader) — with two FK paths
// between the same pair of tables, EVERY relation between them needs an
// explicit relationName on both sides, or Drizzle's query builder throws at
// runtime ("multiple relations … Please specify relation name") and the page
// 500s. lib/db/relations.test.ts plans every relation to catch this in CI.
export const documentsRelations = relations(documents, ({ one }) => ({
  user: one(users, {
    fields: [documents.userId],
    references: [users.id],
    relationName: "patient_documents",
  }),
  uploadedByUser: one(users, {
    fields: [documents.uploadedBy],
    references: [users.id],
    relationName: "uploaded_by",
  }),
}));

// threads ↔ users is DOUBLY connected too (patient + addressed clinician), so
// the same rule as documents applies: both relations carry an explicit
// relationName on both sides, or the query builder throws at runtime.
export const threadsRelations = relations(threads, ({ one, many }) => ({
  patient: one(users, {
    fields: [threads.patientId],
    references: [users.id],
    relationName: "patient_threads",
  }),
  clinician: one(users, {
    fields: [threads.clinicianId],
    references: [users.id],
    relationName: "clinician_threads",
  }),
  messages: many(threadMessages),
  participants: many(threadParticipants),
}));

export const threadMessagesRelations = relations(threadMessages, ({ one }) => ({
  thread: one(threads, { fields: [threadMessages.threadId], references: [threads.id] }),
  sender: one(users, { fields: [threadMessages.senderId], references: [users.id] }),
}));

// No relation to users: actorId is intentionally not a user FK, so the join is
// the caller's to make only for participants it knows are human.
export const threadParticipantsRelations = relations(threadParticipants, ({ one }) => ({
  thread: one(threads, {
    fields: [threadParticipants.threadId],
    references: [threads.id],
  }),
}));

export const patientNotesRelations = relations(patientNotes, ({ one }) => ({
  patient: one(users, {
    fields: [patientNotes.patientId],
    references: [users.id],
    relationName: "patient_notes",
  }),
  admin: one(users, {
    fields: [patientNotes.adminId],
    references: [users.id],
    relationName: "admin_notes",
  }),
}));

export const programmeAssignmentsRelations = relations(programmeAssignments, ({ one }) => ({
  patient: one(users, {
    fields: [programmeAssignments.patientId],
    references: [users.id],
    relationName: "patient_programme",
  }),
  assignedByUser: one(users, {
    fields: [programmeAssignments.assignedBy],
    references: [users.id],
    relationName: "admin_programme",
  }),
}));

export const emailQueueRelations = relations(emailQueue, ({ one }) => ({
  user: one(users, { fields: [emailQueue.userId], references: [users.id] }),
}));

export const clinicalGoalsRelations = relations(clinicalGoals, ({ one }) => ({
  patient: one(users, {
    fields: [clinicalGoals.patientId],
    references: [users.id],
    relationName: "patient_goals",
  }),
  setByAdmin: one(users, {
    fields: [clinicalGoals.setByAdminId],
    references: [users.id],
    relationName: "admin_goals",
  }),
}));

// measurements ↔ users is doubly connected (subject + recorder), so both sides
// carry an explicit relationName — without it Drizzle throws "multiple
// relations" at runtime and the page 500s. lib/db/relations.test.ts plans every
// relation in CI so that failure never reaches a patient.
export const measurementsRelations = relations(measurements, ({ one }) => ({
  patient: one(users, {
    fields: [measurements.patientId],
    references: [users.id],
    relationName: "patient_measurements",
  }),
  recordedByUser: one(users, {
    fields: [measurements.recordedBy],
    references: [users.id],
    relationName: "recorded_measurements",
  }),
}));

export const clinicianCalendarsRelations = relations(clinicianCalendars, ({ one, many }) => ({
  clinician: one(users, {
    fields: [clinicianCalendars.clinicianId],
    references: [users.id],
    relationName: "clinician_calendars",
  }),
  busy: many(calendarBusy),
}));

export const calendarBusyRelations = relations(calendarBusy, ({ one }) => ({
  calendar: one(clinicianCalendars, {
    fields: [calendarBusy.calendarId],
    references: [clinicianCalendars.id],
  }),
  clinician: one(users, {
    fields: [calendarBusy.clinicianId],
    references: [users.id],
    relationName: "clinician_busy",
  }),
}));

export const assessmentLeadsRelations = relations(assessmentLeads, ({ one }) => ({
  convertedUser: one(users, {
    fields: [assessmentLeads.convertedUserId],
    references: [users.id],
  }),
}));
