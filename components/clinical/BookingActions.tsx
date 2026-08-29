"use client";

/**
 * Cancel or move one appointment — the same control on both sides.
 *
 * Two things this deliberately does NOT do:
 *
 *  1. It never hides the cancel button to prevent a late cancellation. Removing
 *     the way out does not produce attendance, it produces a no-show: the clinic
 *     finds out at the appointment instead of the night before, and the patient
 *     learns the portal is a thing that traps them. It tells them it is late,
 *     tells them there is no charge, and lets them through.
 *  2. It never surprises anyone. The notice window is stated next to the confirm
 *     button when booking, not first met while trying to cancel — a rule you
 *     discover at the moment it costs you is experienced as a trap, however
 *     reasonable it is.
 *
 * The verdict is computed from lib/domain/cancellation, the same function the
 * API enforces, so a button that offers something the server will refuse cannot
 * exist.
 */

import { useEffect, useState } from "react";
import shared from "@/app/shared.module.css";
import { CANCELLATION_POLICY, CANCELLATION_REASON_MAX } from "@/lib/config/cancellation";
import { assessCancellation, assessReschedule, describeNotice } from "@/lib/domain/cancellation";
import type { BookingStatus } from "@/lib/config/booking-status";

export type ActionableBooking = {
  id: string;
  status: BookingStatus;
  /** ISO string as it arrives from the API. */
  scheduledAt: string | null;
  /** Needed so "Move" opens on the clinician the appointment is actually with. */
  clinicianId?: string | null;
  /** When it was booked — decides whether a late cancellation was ever avoidable. */
  createdAt?: string | null;
};

export function BookingActions({
  booking,
  onChanged,
  onMove,
  actorLabel = "patient",
}: {
  booking: ActionableBooking;
  onChanged: () => void;
  /** Opens the picker in move mode. Omitted where there is nowhere to move to. */
  onMove?: (booking: ActionableBooking) => void;
  /** Whose action this is — only changes the wording, never the permission. */
  actorLabel?: "patient" | "clinic";
}) {
  // The reader's clock decides whether this is late, and only the reader has it.
  // Computing it during render would differ between the server pass and the
  // browser and blow up hydration, so the controls appear once mounted.
  const [now, setNow] = useState<Date | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setNow(new Date()), []);

  if (!now) return null;

  const timing = {
    status: booking.status,
    scheduledAt: booking.scheduledAt ? new Date(booking.scheduledAt) : null,
    createdAt: booking.createdAt ? new Date(booking.createdAt) : null,
  };
  const cancel = assessCancellation(timing, now);
  const move = assessReschedule(timing, now);

  if (!cancel.allowed && !move.allowed) return null;

  const late = cancel.allowed && cancel.late;
  const notice = cancel.allowed ? describeNotice(cancel.hoursNotice) : null;

  async function handleCancel() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Could not cancel — please try again.");
        return;
      }
      setConfirming(false);
      setReason("");
      onChanged();
    } catch {
      setError("Could not cancel — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <div className={shared.cardTight}>
        <p className={shared.formHint}>
          {late
            ? actorLabel === "clinic"
              ? CANCELLATION_POLICY.lateWarningClinic
              : CANCELLATION_POLICY.lateWarningPatient
            : notice
              ? `Cancelling with ${notice}' notice. The slot goes back to another patient.`
              : "This request will be withdrawn."}
        </p>
        <label className={shared.formHint} htmlFor={`reason-${booking.id}`}>
          {actorLabel === "clinic"
            ? "Reason (recorded on the booking)"
            : "Anything we should know? (optional)"}
        </label>
        <textarea
          id={`reason-${booking.id}`}
          className={shared.formTextarea}
          value={reason}
          maxLength={CANCELLATION_REASON_MAX}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            actorLabel === "clinic" ? "Clinician unavailable…" : "Feeling unwell, travelling…"
          }
        />
        {error && <p className={shared.formError}>{error}</p>}
        <div className={shared.formActions}>
          <button
            type="button"
            className={shared.btnPrimary}
            onClick={handleCancel}
            disabled={busy}
          >
            {busy ? "Cancelling…" : "Yes, cancel it"}
          </button>
          <button
            type="button"
            className={shared.btnText}
            onClick={() => {
              setConfirming(false);
              setError("");
            }}
            disabled={busy}
          >
            Keep the appointment
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={shared.formActions}>
      {move.allowed && onMove && (
        <button type="button" className={shared.btnText} onClick={() => onMove(booking)}>
          Move
        </button>
      )}
      {cancel.allowed && (
        <button type="button" className={shared.btnText} onClick={() => setConfirming(true)}>
          Cancel
        </button>
      )}
    </div>
  );
}
