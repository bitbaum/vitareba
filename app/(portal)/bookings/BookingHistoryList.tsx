import styles from "../portal.module.css";
import bookingStyles from "./bookings.module.css";
import {
  BOOKING_STATUS_CONFIG,
  BOOKING_TYPE_CONFIG,
  MACHINE_TYPE_CONFIG,
  type BookingRow,
} from "@/lib/config/booking-status";
import { formatAppointment, formatDateLong } from "@/lib/utils/format";
import { COMPANY } from "@/lib/config/company";
import { LoadingState } from "@/components/LoadingState";
import { BookingActions, type ActionableBooking } from "@/components/clinical/BookingActions";
import { CLINIC_LOCATION } from "@/lib/domain/booking-calendar";

type Props = {
  loading: boolean;
  loadError: boolean;
  onRetry: () => void;
  bookings: BookingRow[];
  clinicianLabel: string;
  slotMinutes: number;
  onRequestBooking: () => void;
  onChanged: () => void;
  onMove: (target: ActionableBooking) => void;
};

/** Every past and upcoming appointment — loading/error/empty states included. */
export function BookingHistoryList({
  loading, loadError, onRetry, bookings, clinicianLabel, slotMinutes, onRequestBooking, onChanged, onMove,
}: Props) {
  if (loading) return <LoadingState />;

  if (loadError) {
    return (
      <div className={styles.card}>
        <div className={styles.emptyState}>
          Could not load bookings.{" "}
          <button type="button" onClick={onRetry} className={styles.retryBtn}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className={styles.card}>
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No bookings yet</p>
          <p>A discovery call is the fastest way to find out if {COMPANY.shortName} is right for you — {slotMinutes} minutes with {clinicianLabel} to look at your Inflection Edge results and map out a programme.</p>
          <button type="button" className={styles.emptyAction} onClick={onRequestBooking}>
            Request a booking →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.listStack}>
      {bookings.map((b) => {
        const s = BOOKING_STATUS_CONFIG[b.status] ?? BOOKING_STATUS_CONFIG.pending;
        const typeLabel = BOOKING_TYPE_CONFIG[b.bookingType]?.label ?? b.bookingType;
        const machineLabel = b.machineType ? MACHINE_TYPE_CONFIG[b.machineType]?.label : null;
        return (
          <div key={b.id} className={styles.card}>
            <div className={bookingStyles.bookingItem}>
              {/* WHEN → WHAT/WHO → WHERE. It used to be one sentence
                  concatenating all three, with "Requested 16/08/2026"
                  underneath — a date nobody has ever needed, in a third
                  format, directly below the one that matters. */}
              <div className={bookingStyles.bookingItemInfo}>
                {b.scheduledAt ? (
                  <p className={bookingStyles.bookingWhen}>{formatAppointment(b.scheduledAt)}</p>
                ) : (
                  <p className={bookingStyles.bookingWhenPending}>
                    {b.preferredDate
                      ? `You asked for ${formatDateLong(b.preferredDate)}`
                      : "No time agreed yet"}
                  </p>
                )}
                <p className={bookingStyles.bookingWith}>
                  {machineLabel ? `${typeLabel} — ${machineLabel}` : typeLabel}
                  {b.clinician?.name ? ` with ${b.clinician.name}` : ""}
                </p>
                {b.scheduledAt && (
                  <p className={bookingStyles.bookingWhere}>{CLINIC_LOCATION}</p>
                )}
                {b.notes && <p className={bookingStyles.bookingNote}>{b.notes}</p>}
              </div>
              <div className={bookingStyles.bookingActions}>
                <span className={`${styles.pill} ${s.badgeClass}`}>
                  {s.label}
                </span>
                {/* Was gated to `pending`, which is a status no booked
                    appointment ever has — every patient who picked a time
                    was stuck with it. The control now decides for itself,
                    from the same rule the API enforces. */}
                <BookingActions
                  booking={{
                    id: b.id,
                    status: b.status,
                    scheduledAt: b.scheduledAt,
                    clinicianId: b.clinician?.id ?? null,
                    createdAt: b.createdAt,
                  }}
                  onChanged={onChanged}
                  onMove={onMove}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
