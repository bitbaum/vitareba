import styles from "../portal.module.css";
import bookingStyles from "./bookings.module.css";
import authStyles from "../../forms.module.css";
import {
  BOOKING_TYPE_CONFIG,
  BOOKING_TYPE_VALUES,
  MACHINE_TYPE_CONFIG,
  MACHINE_TYPE_VALUES,
  type BookingType,
  type MachineType,
} from "@/lib/config/booking-status";
import { BOOKING_NOTES_MAX_LENGTH } from "@/lib/config/portal";

type Props = {
  bookingType: BookingType;
  onBookingTypeChange: (t: BookingType) => void;
  machineType: MachineType | "";
  onMachineTypeChange: (m: MachineType | "") => void;
  preferredDate: string;
  onPreferredDateChange: (d: string) => void;
  notes: string;
  onNotesChange: (n: string) => void;
  submitting: boolean;
  submitError: string;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
};

/**
 * The fallback path for when none of the native slot picker's times work —
 * a manual request a clinician reviews personally rather than an instantly
 * confirmed slot.
 */
export function RequestBookingForm({
  bookingType, onBookingTypeChange,
  machineType, onMachineTypeChange,
  preferredDate, onPreferredDateChange,
  notes, onNotesChange,
  submitting, submitError,
  onSubmit, onCancel,
}: Props) {
  return (
    <div className={`${styles.card} ${styles.cardGap}`}>
      <p className={styles.cardTitle}>Request a booking</p>
      <p className={styles.formHint}>
        Use this when none of the times above work. A clinician reviews every request personally —
        include anything that helps them prepare; your Inflection Edge scores are already on file.
      </p>
      <form onSubmit={onSubmit} className={styles.formStack}>
        <div className={authStyles.field}>
          <label className={authStyles.label}>Type</label>
          <div className={bookingStyles.typeToggle}>
            {BOOKING_TYPE_VALUES.map((t) => (
              <button
                key={t}
                type="button"
                className={`${bookingStyles.typeBtn}${bookingType === t ? ` ${bookingStyles.typeBtnActive}` : ""}`}
                onClick={() => { onBookingTypeChange(t); onMachineTypeChange(""); }}
              >
                {BOOKING_TYPE_CONFIG[t].label}
              </button>
            ))}
          </div>
        </div>

        {bookingType === "machine" && (
          <div className={authStyles.field}>
            <label className={authStyles.label} htmlFor="machineType">Technology</label>
            <select
              id="machineType"
              className={authStyles.input}
              value={machineType}
              onChange={(e) => onMachineTypeChange(e.target.value as MachineType | "")}
              required
            >
              <option value="">Select technology…</option>
              {MACHINE_TYPE_VALUES.map((m) => (
                <option key={m} value={m}>{MACHINE_TYPE_CONFIG[m].label}</option>
              ))}
            </select>
          </div>
        )}

        <div className={authStyles.field}>
          <label className={authStyles.label} htmlFor="date">Preferred date (optional)</label>
          <input id="date" className={authStyles.input} type="date" value={preferredDate} onChange={(e) => onPreferredDateChange(e.target.value)} />
        </div>
        <div className={authStyles.field}>
          <label className={authStyles.label} htmlFor="notes">
            {bookingType === "machine" ? "Anything to prepare?" : "What would you like to focus on?"}
          </label>
          <textarea
            id="notes"
            className={styles.formTextarea}
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            maxLength={BOOKING_NOTES_MAX_LENGTH}
            placeholder={
              bookingType === "machine"
                ? "e.g. First session, looking to try PEMF for focus…"
                : "e.g. I want to understand my ADHD diagnosis and what a programme could look like for me…"
            }
          />
        </div>
        {submitError && <p className={styles.formError}>{submitError}</p>}
        <div className={styles.formActions}>
          <button
            type="submit"
            className={`${styles.btnPrimary} ${styles.formActionPrimary}`}
            disabled={submitting || (bookingType === "machine" && !machineType)}
          >
            {submitting ? "Submitting…" : "Submit request"}
          </button>
          <button type="button" onClick={onCancel} className={styles.cancelBtn}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
