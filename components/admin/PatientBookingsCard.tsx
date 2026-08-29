import styles from "@/app/(admin)/admin.module.css";
import {
  BOOKING_STATUS_CONFIG,
  BOOKING_TYPE_CONFIG,
  MACHINE_TYPE_CONFIG,
  type BookingRow,
} from "@/lib/config/booking-status";
import { formatDateLong, formatSlotDay, formatSlotTime } from "@/lib/utils/format";

// Loosen date-ish fields: this card is called from both the server (Drizzle
// Date) and client (API string) sides.
type PatientBooking = Omit<BookingRow, "createdAt" | "scheduledAt" | "clinician"> & {
  scheduledAt: Date | string | null;
  clinician?: { id: string; name: string | null } | null;
};

export function PatientBookingsCard({ bookings }: { bookings: PatientBooking[] }) {
  return (
    <div className={styles.card}>
      <p className={styles.cardLabel}>Bookings ({bookings.length})</p>
      {bookings.length === 0 ? (
        <div className={styles.emptyState}>No bookings.</div>
      ) : (
        <div className={styles.bookingList}>
          {bookings.map((b) => {
            const s = BOOKING_STATUS_CONFIG[b.status] ?? BOOKING_STATUS_CONFIG.pending;
            const typeLabel = BOOKING_TYPE_CONFIG[b.bookingType]?.label ?? b.bookingType;
            const machineLabel = b.machineType ? MACHINE_TYPE_CONFIG[b.machineType]?.label : null;
            return (
              <div key={b.id} className={styles.bookingRow}>
                <div>
                  <div className={styles.bookingDate}>
                    {machineLabel ? `${typeLabel} — ${machineLabel}` : typeLabel}
                    {b.scheduledAt
                      ? ` · ${formatSlotDay(b.scheduledAt)}, ${formatSlotTime(b.scheduledAt)}`
                      : b.preferredDate
                        ? ` · ${formatDateLong(b.preferredDate)}`
                        : ""}
                  </div>
                  {/* Which clinician — silently dropped before despite the type
                      already carrying it. Invisible with one doctor; with two,
                      an admin reading this list had no way to tell them apart. */}
                  {b.clinician?.name && (
                    <div className={styles.bookingNotes}>with {b.clinician.name}</div>
                  )}
                  {b.notes && <div className={styles.bookingNotes}>{b.notes}</div>}
                </div>
                <span className={`${styles.badge} ${s.badgeClass}`}>{s.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
