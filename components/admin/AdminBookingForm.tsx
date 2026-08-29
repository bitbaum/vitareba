"use client";

import { useState } from "react";
import styles from "@/app/(admin)/admin.module.css";
import {
  BOOKING_TYPE_CONFIG,
  BOOKING_TYPE_VALUES,
  MACHINE_TYPE_CONFIG,
  MACHINE_TYPE_VALUES,
  BOOKING_STATUS,
  type BookingRow,
} from "@/lib/config/booking-status";
import { BOOKING_NOTES_MAX_LENGTH, BOOKING_PREFERRED_DATE_MAX_LENGTH } from "@/lib/config/portal";

export function AdminBookingForm({
  patientId,
  onAdded,
}: {
  patientId: string;
  onAdded?: (booking: BookingRow) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [bookingType, setBookingType] =
    useState<(typeof BOOKING_TYPE_VALUES)[number]>("consultation");
  const [machineType, setMachineType] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [status, setStatus] = useState<"confirmed" | "attended">(BOOKING_STATUS.confirmed);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          bookingType,
          machineType: bookingType === "machine" && machineType ? machineType : null,
          preferredDate: preferredDate || undefined,
          status,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError("Failed to add booking.");
        return;
      }
      // Reset form
      setBookingType("consultation");
      setMachineType("");
      setPreferredDate("");
      setStatus(BOOKING_STATUS.confirmed);
      setNotes("");
      setExpanded(false);
      onAdded?.(data.data);
    } catch {
      setError("Failed to add booking.");
    } finally {
      setSaving(false);
    }
  }

  if (!expanded) {
    return (
      <button type="button" onClick={() => setExpanded(true)} className={styles.composeNewBtn}>
        + Log booking
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={styles.composeForm}>
      <div className={styles.goalFormGrid3}>
        <div>
          <label className={styles.formLabel} htmlFor="ab-type">
            Type
          </label>
          <select
            id="ab-type"
            value={bookingType}
            onChange={(e) => {
              setBookingType(e.target.value as typeof bookingType);
              setMachineType("");
            }}
            className={styles.goalFormSelect}
          >
            {BOOKING_TYPE_VALUES.map((t) => (
              <option key={t} value={t}>
                {BOOKING_TYPE_CONFIG[t].label}
              </option>
            ))}
          </select>
        </div>

        {bookingType === "machine" && (
          <div>
            <label className={styles.formLabel} htmlFor="ab-machine">
              Machine
            </label>
            <select
              id="ab-machine"
              value={machineType}
              onChange={(e) => setMachineType(e.target.value)}
              className={styles.goalFormSelect}
            >
              <option value="">Select…</option>
              {MACHINE_TYPE_VALUES.map((m) => (
                <option key={m} value={m}>
                  {MACHINE_TYPE_CONFIG[m].label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={styles.formLabel} htmlFor="ab-status">
            Status
          </label>
          <select
            id="ab-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className={styles.goalFormSelect}
          >
            <option value={BOOKING_STATUS.confirmed}>Confirmed</option>
            <option value={BOOKING_STATUS.attended}>Attended</option>
          </select>
        </div>

        <div>
          <label className={styles.formLabel} htmlFor="ab-date">
            Date
          </label>
          <input
            id="ab-date"
            type="date"
            value={preferredDate}
            onChange={(e) => setPreferredDate(e.target.value)}
            maxLength={BOOKING_PREFERRED_DATE_MAX_LENGTH}
            className={styles.goalFormInput}
          />
        </div>
      </div>

      <textarea
        aria-label="Notes (optional)"
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        maxLength={BOOKING_NOTES_MAX_LENGTH}
        className={styles.goalFormTextarea}
      />

      {error && <p className={styles.assignError}>{error}</p>}

      <div className={styles.goalFormActions}>
        <button
          type="submit"
          disabled={saving || (bookingType === "machine" && !machineType)}
          className={styles.goalFormSubmit}
        >
          {saving ? "Saving…" : "Log booking"}
        </button>
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setError("");
          }}
          aria-label="Cancel logging booking"
          className={styles.goalFormCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
