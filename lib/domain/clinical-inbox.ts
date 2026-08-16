/**
 * WHAT IS WAITING FOR THE CLINICIAN — built as one pure function over
 * already-fetched rows, so every judgement it makes can be tested without a
 * database and none of it is re-derived in a page file.
 *
 * It deliberately reuses computePatientSignal rather than inventing a second
 * opinion about who needs attention. Two definitions of "critical" in one
 * product means the list and the dashboard eventually disagree, and the clinician
 * learns to trust neither.
 *
 * The only thing this file adds to the existing signal is the two questions the
 * signal cannot answer: has a measured value crossed a line that should not wait,
 * and is a person sitting there waiting for us to reply.
 */

import {
  INBOX_SECTIONS,
  INBOX_SECTION_LIMIT,
  MESSAGE_OVERDUE_HOURS,
  type InboxSectionDef,
  type InboxSectionKey,
} from "@/lib/config/inbox";
import { PATIENT_SIGNAL } from "@/lib/config/admin";
import { BOOKING_STATUS, type BookingStatus } from "@/lib/config/booking-status";
import { measurementDef, type BiologicalSex } from "@/lib/config/measurements";
import { formatValue, readMeasurement } from "@/lib/domain/measurements";
import { computePatientSignal } from "@/lib/domain/signals";
import { DAY_MS } from "@/lib/utils/format";

const HOUR_MS = 60 * 60 * 1000;

// ─── Inputs ───────────────────────────────────────────────────────────────────

export type InboxCheckin = {
  date: string;
  sleep: number;
  energy: number;
  mood: number;
  focus: number;
  stress: number;
};

export type InboxPatient = {
  id: string;
  name: string | null;
  email: string;
  registeredAt: Date;
  biologicalSex: BiologicalSex | null;
  checkins: InboxCheckin[];
  assessments: { overallScore: number; completedAt: Date }[];
  bookings: { id: string; status: BookingStatus; createdAt: Date; scheduledAt: Date | null }[];
};

export type InboxMeasurement = {
  patientId: string;
  kind: string;
  value: number;
  measuredAt: Date;
};

export type InboxThread = {
  id: string;
  patientId: string;
  subject: string;
  lastMessageAt: Date;
  /** True when the newest message in the thread came from the patient. */
  awaitingReply: boolean;
};

export type InboxInput = {
  now: Date;
  patients: readonly InboxPatient[];
  /** The most recent value per patient per marker — not the whole history. */
  latestMeasurements: readonly InboxMeasurement[];
  threads: readonly InboxThread[];
};

// ─── Output ───────────────────────────────────────────────────────────────────

export type InboxItem = {
  /** Stable across renders so React keys and tests do not depend on order. */
  key: string;
  patientId: string;
  patientName: string;
  headline: string;
  detail: string;
  /** When the clock started for this item — drives "waiting 3 days". */
  since: Date;
};

export type InboxSection = InboxSectionDef & {
  items: InboxItem[];
  /** Items beyond the render limit. Counted, never silently dropped. */
  overflow: number;
};

export type ClinicalInbox = {
  sections: InboxSection[];
  /** Total across every section — zero means the honest "nothing needs you". */
  total: number;
};

// ─── Builder ──────────────────────────────────────────────────────────────────

export function buildClinicalInbox(input: InboxInput): ClinicalInbox {
  const { now, patients, latestMeasurements, threads } = input;
  const nameOf = new Map(patients.map((p) => [p.id, displayFor(p)]));
  const sexOf = new Map(patients.map((p) => [p.id, p.biologicalSex]));

  const buckets: Record<InboxSectionKey, InboxItem[]> = {
    results: [],
    critical: [],
    messages: [],
    bookings: [],
    attention: [],
  };

  // ── Results past an action threshold ──────────────────────────────────────
  for (const m of latestMeasurements) {
    const def = measurementDef(m.kind);
    if (!def) continue;
    const reading = readMeasurement(m.kind, m.value, sexOf.get(m.patientId) ?? null);
    if (!reading.needsAttention) continue;
    buckets.results.push({
      key: `result:${m.patientId}:${m.kind}`,
      patientId: m.patientId,
      patientName: nameOf.get(m.patientId) ?? "Unknown patient",
      headline: `${def.label} ${formatValue(m.kind, m.value)} ${def.unit}`,
      detail: def.alertSource ?? "Outside the range that can wait.",
      since: m.measuredAt,
    });
  }

  // ── Signals ───────────────────────────────────────────────────────────────
  for (const p of patients) {
    const { signal, reason } = computePatientSignal({
      registeredAt: p.registeredAt,
      checkins: p.checkins,
      assessments: p.assessments,
      bookings: p.bookings,
      now,
    });
    if (signal !== PATIENT_SIGNAL.critical && signal !== PATIENT_SIGNAL.attention) continue;
    const item: InboxItem = {
      key: `signal:${p.id}`,
      patientId: p.id,
      patientName: displayFor(p),
      headline: reason,
      detail: lastSeenDetail(p, now),
      since: lastActivity(p) ?? p.registeredAt,
    };
    if (signal === PATIENT_SIGNAL.critical) buckets.critical.push(item);
    else buckets.attention.push(item);
  }

  // ── Messages waiting on us ────────────────────────────────────────────────
  for (const t of threads) {
    if (!t.awaitingReply) continue;
    const hours = Math.floor((now.getTime() - t.lastMessageAt.getTime()) / HOUR_MS);
    buckets.messages.push({
      key: `thread:${t.id}`,
      patientId: t.patientId,
      patientName: nameOf.get(t.patientId) ?? "Unknown patient",
      headline: t.subject,
      detail:
        hours >= MESSAGE_OVERDUE_HOURS
          ? `Waiting ${describeWait(hours)} for a reply.`
          : "Sent today, not yet answered.",
      since: t.lastMessageAt,
    });
  }

  // ── Bookings awaiting confirmation ────────────────────────────────────────
  for (const p of patients) {
    for (const b of p.bookings) {
      if (b.status !== BOOKING_STATUS.pending) continue;
      buckets.bookings.push({
        key: `booking:${b.id}`,
        patientId: p.id,
        patientName: displayFor(p),
        headline: b.scheduledAt
          ? `Requested ${b.scheduledAt.toISOString().slice(0, 10)}`
          : "Consultation requested, no time chosen",
        detail: "Waiting for confirmation.",
        since: b.createdAt,
      });
    }
  }

  // Oldest first, everywhere: the thing that has been waiting longest is the
  // thing most likely to have been forgotten.
  const sections = INBOX_SECTIONS.map((def) => {
    const all = buckets[def.key].sort((a, b) => a.since.getTime() - b.since.getTime());
    return {
      ...def,
      items: all.slice(0, INBOX_SECTION_LIMIT),
      overflow: Math.max(0, all.length - INBOX_SECTION_LIMIT),
    };
  });

  const total = sections.reduce((n, s) => n + s.items.length + s.overflow, 0);
  return { sections, total };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayFor(p: { name: string | null; email: string }): string {
  return p.name?.trim() || p.email;
}

/** Newest signal of life from this patient, whatever form it took. */
function lastActivity(p: InboxPatient): Date | null {
  const candidates: Date[] = [];
  const newestCheckin = [...p.checkins].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (newestCheckin) candidates.push(new Date(`${newestCheckin.date}T00:00:00Z`));
  for (const a of p.assessments) candidates.push(a.completedAt);
  for (const b of p.bookings) candidates.push(b.createdAt);
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, d) => (d > latest ? d : latest));
}

function lastSeenDetail(p: InboxPatient, now: Date): string {
  const last = lastActivity(p);
  if (!last) return "Nothing recorded since they registered.";
  const days = Math.floor((now.getTime() - last.getTime()) / DAY_MS);
  if (days <= 0) return "Active today.";
  if (days === 1) return "Last activity yesterday.";
  return `Last activity ${days} days ago.`;
}

function describeWait(hours: number): string {
  if (hours < 48) return "a day";
  const days = Math.floor(hours / 24);
  return `${days} days`;
}
