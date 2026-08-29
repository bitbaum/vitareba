import {
  type PatientSignal,
  PATIENT_SIGNAL,
  NO_CHECKIN_CRITICAL_DAYS,
  SCORE_DROP_CRITICAL,
  NEW_PATIENT_GRACE_DAYS,
  ATTENDED_FOLLOW_UP_DAYS,
  SPARKLINE_LOW_THRESHOLD,
  SPARKLINE_MID_THRESHOLD,
} from "@/lib/config/admin";
import { DAY_MS } from "@/lib/utils/format";
import { CHECKIN_SCALE_MAX } from "@/lib/config/portal";
import { BOOKING_STATUS, type BookingStatus } from "@/lib/config/booking-status";

type CheckinRow = {
  date: string; // YYYY-MM-DD
  sleep: number;
  energy: number;
  mood: number;
  focus: number;
  stress: number;
};

type AssessmentRow = {
  overallScore: number;
  completedAt: Date;
};

export type SignalInput = {
  registeredAt: Date;
  checkins: CheckinRow[]; // last N days, descending by date
  assessments: AssessmentRow[]; // latest 2, descending
  bookings: { id: string; status: BookingStatus; createdAt: Date }[];
  now?: Date; // injectable for tests; defaults to new Date()
};

export type SignalResult = {
  signal: PatientSignal;
  reason: string;
  /** Secondary sort key within a tier: higher = more urgent. */
  urgency: number;
};

/** Wellness score per check-in day: 1–5 where 5 is best. Stress is inverted. */
export function wellnessAvg(c: CheckinRow): number {
  return (c.sleep + c.energy + c.mood + c.focus + (CHECKIN_SCALE_MAX + 1 - c.stress)) / 5;
}

export function computePatientSignal({
  registeredAt,
  checkins,
  assessments,
  bookings,
  now = new Date(),
}: SignalInput): SignalResult {
  const daysSinceRegistration = Math.floor((now.getTime() - registeredAt.getTime()) / DAY_MS);

  // New: registered recently, no activity expected yet
  if (daysSinceRegistration < NEW_PATIENT_GRACE_DAYS) {
    return {
      signal: PATIENT_SIGNAL.new,
      reason: "Registered recently — grace period active",
      urgency: 0,
    };
  }

  // Check-in based signals
  if (checkins.length > 0) {
    const sorted = [...checkins].sort((a, b) => b.date.localeCompare(a.date));
    const lastCheckinDate = new Date(sorted[0].date + "T00:00:00");
    const daysSinceLast = Math.floor((now.getTime() - lastCheckinDate.getTime()) / DAY_MS);

    // Critical: has check-in history but gone silent ≥ threshold days
    if (daysSinceLast >= NO_CHECKIN_CRITICAL_DAYS) {
      return {
        signal: PATIENT_SIGNAL.critical,
        reason: `No check-in for ${daysSinceLast} days (last: ${sorted[0].date})`,
        urgency: daysSinceLast, // longer silence = more urgent
      };
    }

    // Critical: last 3 check-ins are on consecutive calendar days and all show strictly declining wellness.
    // Consecutive-day check prevents false positives when a patient logs infrequently (e.g. days 0, 3, 6).
    const last3 = sorted.slice(0, 3);
    if (last3.length === 3) {
      const [t0, t1, t2] = last3.map((c) => new Date(c.date + "T00:00:00Z").getTime());
      const areConsecutive = t0 - t1 === DAY_MS && t1 - t2 === DAY_MS;
      if (areConsecutive) {
        const [d0, d1, d2] = last3.map(wellnessAvg); // d0 = most recent
        if (d0 < d1 && d1 < d2) {
          return {
            signal: PATIENT_SIGNAL.critical,
            reason: `Wellness declining 3 consecutive days (${d2.toFixed(1)} → ${d1.toFixed(1)} → ${d0.toFixed(1)})`,
            urgency: 50, // fixed: less urgent than long silence, more than score drop
          };
        }
      }
    }
  }

  // Critical: assessment score dropped significantly
  if (assessments.length >= 2) {
    const drop = assessments[0].overallScore - assessments[1].overallScore;
    if (drop < -SCORE_DROP_CRITICAL) {
      return {
        signal: PATIENT_SIGNAL.critical,
        reason: `Assessment score dropped ${Math.abs(drop)} points (${assessments[1].overallScore} → ${assessments[0].overallScore})`,
        urgency: Math.abs(drop), // larger drop = more urgent
      };
    }
  }

  // Attention: registered but never taken assessment
  if (assessments.length === 0) {
    return {
      signal: PATIENT_SIGNAL.attention,
      reason: "No assessment taken yet",
      urgency: daysSinceRegistration,
    };
  }

  // Attention: has assessment but no active booking (confirmed or attended)
  const hasActiveBooking = bookings.some(
    (b) => b.status === BOOKING_STATUS.confirmed || b.status === BOOKING_STATUS.attended,
  );
  if (!hasActiveBooking) {
    return {
      signal: PATIENT_SIGNAL.attention,
      reason: "Assessment done — no booking yet",
      urgency: 10,
    };
  }

  // Attention: attended consultation but no confirmed follow-up booking after N days
  const hasConfirmed = bookings.some((b) => b.status === BOOKING_STATUS.confirmed);
  if (!hasConfirmed) {
    const attendedBookings = bookings.filter((b) => b.status === BOOKING_STATUS.attended);
    if (attendedBookings.length > 0) {
      const mostRecentAttended = [...attendedBookings].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      )[0];
      const daysSince = Math.floor(
        (now.getTime() - mostRecentAttended.createdAt.getTime()) / DAY_MS,
      );
      if (daysSince > ATTENDED_FOLLOW_UP_DAYS) {
        return {
          signal: PATIENT_SIGNAL.attention,
          reason: `Consultation attended ${daysSince} days ago — follow-up booking needed`,
          urgency: daysSince, // longer since consultation = more urgent
        };
      }
    }
  }

  return { signal: PATIENT_SIGNAL.active, reason: "All signals normal", urgency: 0 };
}

/**
 * Maps a wellness average (1–5 scale) to a CSS modifier class token:
 * "low" | "mid" | "high". Thresholds are sourced from admin config SSOT.
 */
export function sparkLevel(avg: number): "low" | "mid" | "high" {
  if (avg < SPARKLINE_LOW_THRESHOLD) return "low";
  if (avg < SPARKLINE_MID_THRESHOLD) return "mid";
  return "high";
}
