"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import shared from "../portal.module.css";
import checkinStyles from "./checkin.module.css";
import { PORTAL_ROUTES } from "@/lib/config/routes";
import { CHECKIN_QUICK_SLOT_COUNT } from "@/lib/config/portal";
import { DEFAULT_AVAILABILITY } from "@/lib/config/scheduling";
import { formatSlotDay, formatSlotTime } from "@/lib/utils/format";

/**
 * Book the person who reads this data, without leaving the page. The full
 * picker on /bookings still exists for "any other time" — this offers the next
 * few openings with YOUR clinician, which is the booking a patient actually
 * wants the moment they have just logged something worth discussing.
 *
 * `clinicianId` comes from care_team, so this works in both directions: when
 * a clinician checks in as somebody else's patient, this books THEIR doctor.
 */
export function QuickBook({
  clinicianLabel,
  clinicianId,
}: {
  clinicianLabel: string;
  clinicianId: string | null;
}) {
  const [slots, setSlots] = useState<string[]>([]);
  const [bookedWith, setBookedWith] = useState<string | null>(null);
  /** The clinician the SERVER picked — the id the booking must carry. */
  const [resolvedId, setResolvedId] = useState<string | null>(clinicianId);
  const [slotMinutes, setSlotMinutes] = useState(DEFAULT_AVAILABILITY.slotMinutes);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const qs = clinicianId ? `?clinicianId=${encodeURIComponent(clinicianId)}` : "";
      const res = await fetch(`/api/bookings/slots${qs}`);
      if (!res.ok) return; // degrades to the link out to the full picker
      const data = await res.json();
      setSlots(data.data ?? []);
      if (data.slotMinutes) setSlotMinutes(data.slotMinutes);
      // Whoever the server actually resolved — never assume it matched the
      // prop. A patient with no care team still gets a real, bookable doctor.
      const resolved = (data.clinicians ?? []).find(
        (c: { id: string }) => c.id === data.clinicianId
      );
      setResolvedId(data.clinicianId ?? null);
      setBookedWith(resolved?.name ?? null);
    } catch {
      // same fallback: the card still links to /bookings
    } finally {
      setLoading(false);
    }
  }, [clinicianId]);

  useEffect(() => {
    load();
  }, [load]);

  const label = bookedWith ?? clinicianLabel;
  const offered = slots.slice(0, CHECKIN_QUICK_SLOT_COUNT);

  async function confirm() {
    if (!selected || !resolvedId) return;
    setBooking(true);
    setError("");
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: selected, clinicianId: resolvedId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(
          data.code === "slot_taken"
            ? "That time was just taken — here are the current openings."
            : "Booking failed. Please try again."
        );
        setSelected(null);
        load();
        return;
      }
      setBooked(`${formatSlotDay(selected)} at ${formatSlotTime(selected)}`);
      setSelected(null);
    } catch {
      setError("Booking failed. Please try again.");
    } finally {
      setBooking(false);
    }
  }

  if (booked) {
    return (
      <div className={shared.card}>
        <p className={shared.cardTitle}>Appointment confirmed</p>
        <p className={shared.formHint}>
          {booked} with {label}. A confirmation email with a calendar invite is on its way.
        </p>
        <Link href={PORTAL_ROUTES.bookings} className={checkinStyles.quickLink}>
          Manage your bookings →
        </Link>
      </div>
    );
  }

  return (
    <div className={shared.card}>
      <p className={shared.cardTitle}>Book {label}</p>
      {loading ? (
        <p className={shared.formHint}>Looking for open times…</p>
      ) : offered.length === 0 ? (
        <>
          <p className={shared.formHint}>
            No open times with {label} right now — send a request and the clinic will find one with you.
          </p>
          <Link href={PORTAL_ROUTES.bookings} className={checkinStyles.quickLink}>
            Request a time →
          </Link>
        </>
      ) : (
        <>
          <p className={shared.formHint}>
            {slotMinutes} min with {label} · Zürich time — pick one and it&apos;s confirmed instantly.
          </p>
          <div className={checkinStyles.slotRow}>
            {offered.map((iso) => (
              <button
                key={iso}
                type="button"
                aria-pressed={iso === selected}
                className={`${checkinStyles.slotChip}${iso === selected ? ` ${checkinStyles.slotChipActive}` : ""}`}
                onClick={() => setSelected(iso === selected ? null : iso)}
              >
                <span className={checkinStyles.slotDay}>{formatSlotDay(iso)}</span>
                <span className={checkinStyles.slotTime}>{formatSlotTime(iso)}</span>
              </button>
            ))}
          </div>
          <div className={checkinStyles.quickActions}>
            <button
              type="button"
              className={`${shared.btnPrimary} ${shared.btnSm}`}
              onClick={confirm}
              disabled={!selected || !resolvedId || booking}
            >
              {booking ? "Booking…" : selected ? "Confirm appointment" : "Select a time"}
            </button>
            <Link href={PORTAL_ROUTES.bookings} className={checkinStyles.quickLink}>
              See all times →
            </Link>
          </div>
        </>
      )}
      {error && <p className={shared.formErrorTop}>{error}</p>}
    </div>
  );
}
