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
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["patient", "admin"]);
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
export const machineTypeEnum = pgEnum("machine_type", [
  "h2_therapy",
  "ihht",
  "pemf",
  "infrared",
  "hrv_biofeedback",
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
  // Signal tracking (updated by cron/signals, used to detect critical transitions)
  lastKnownSignal: varchar("last_known_signal", { length: 20 }),
  criticalAlertSentAt: timestamp("critical_alert_sent_at", { mode: "date" }),
  dipAlertSentAt: timestamp("dip_alert_sent_at", { mode: "date" }),
  // Updated when patient opens the goals page — drives "new goals" badge in nav
  goalsSeenAt: timestamp("goals_seen_at", { mode: "date" }),
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

// ─── Assessments ──────────────────────────────────────────────────────────────

export const assessmentResults = pgTable("assessment_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  scores: jsonb("scores").notNull(),
  overallScore: integer("overall_score").notNull(),
  completedAt: timestamp("completed_at", { mode: "date" }).notNull().defaultNow(),
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
    clinicianId: uuid("clinician_id").references(() => users.id),
    // Exact slot start for portal-scheduled appointments (null = manual request
    // without a fixed time). The partial unique index below makes double-
    // booking a clinician's slot impossible at the DB level — the API's
    // conflict re-check can race, this cannot.
    scheduledAt: timestamp("scheduled_at", { mode: "date" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bookings_clinician_slot_idx")
      .on(t.clinicianId, t.scheduledAt)
      .where(sql`${t.status} IN ('pending', 'confirmed') AND ${t.scheduledAt} IS NOT NULL`),
  ]
);

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

// ─── Documents ────────────────────────────────────────────────────────────────

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id),
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
  clinicianId: uuid("clinician_id").references(() => users.id),
  subject: text("subject").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at", { mode: "date" }).notNull().defaultNow(),
});

export const threadMessages = pgTable("thread_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => threads.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  readAt: timestamp("read_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

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
  emailQueue: many(emailQueue),
  assessmentLeads: many(assessmentLeads),
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
}));

export const threadMessagesRelations = relations(threadMessages, ({ one }) => ({
  thread: one(threads, { fields: [threadMessages.threadId], references: [threads.id] }),
  sender: one(users, { fields: [threadMessages.senderId], references: [users.id] }),
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

export const assessmentLeadsRelations = relations(assessmentLeads, ({ one }) => ({
  convertedUser: one(users, {
    fields: [assessmentLeads.convertedUserId],
    references: [users.id],
  }),
}));
