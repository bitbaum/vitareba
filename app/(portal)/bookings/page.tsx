"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "../portal.module.css";
import bookingStyles from "./bookings.module.css";
import authStyles from "../../forms.module.css";
import {
  BOOKING_STATUS,
  BOOKING_STATUS_CONFIG,
  BOOKING_TYPE_CONFIG,
  BOOKING_TYPE_VALUES,
  MACHINE_TYPE_CONFIG,
  MACHINE_TYPE_VALUES,
  type BookingRow,
  type BookingType,
  type MachineType,
} from "@/lib/config/booking-status";
import { formatDateLong, formatDateNumeric, formatSlotDay, formatSlotTime } from "@/lib/utils/format";
import { COMPANY } from "@/lib/config/company";
import { BOOKING_SUCCESS_MS, BOOKING_NOTES_MAX_LENGTH } from "@/lib/config/portal";
import { LoadingState } from "@/components/LoadingState";


export default function BookingsPage() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [bookingType, setBookingType] = useState<BookingType>("consultation");
  const [machineType, setMachineType] = useState<MachineType | "">("");
  const [preferredDate, setPreferredDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch("/api/bookings");
      if (!res.ok) { setLoadError(true); return; }
      const data = await res.json();
      setBookings(data.data ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Slot picker state ──────────────────────────────────────────────────────
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [clinicians, setClinicians] = useState<{ id: string; name: string }[]>([]);
  const [clinicianId, setClinicianId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slotBooking, setSlotBooking] = useState(false);
  const [slotError, setSlotError] = useState("");
  const [slotSuccess, setSlotSuccess] = useState<string | null>(null);

  const loadSlots = useCallback(async (forClinician?: string | null) => {
    try {
      const qs = forClinician ? `?clinicianId=${forClinician}` : "";
      const res = await fetch(`/api/bookings/slots${qs}`);
      if (!res.ok) return;
      const data = await res.json();
      setSlots(data.data ?? []);
      setClinicians(data.clinicians ?? []);
      setClinicianId(data.clinicianId ?? null);
    } catch {
      // slot picker degrades to the manual request flow below
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  function selectClinician(id: string) {
    if (id === clinicianId) return;
    setSelectedSlot(null);
    setSelectedDay(null);
    setSlotsLoading(true);
    loadSlots(id);
  }

  // Slots grouped by clinic day, insertion order = ascending
  const slotsByDay = new Map<string, string[]>();
  for (const iso of slots) {
    const day = formatSlotDay(iso);
    const list = slotsByDay.get(day) ?? [];
    list.push(iso);
    slotsByDay.set(day, list);
  }
  const dayKeys = [...slotsByDay.keys()];
  const activeDay = selectedDay && slotsByDay.has(selectedDay) ? selectedDay : dayKeys[0] ?? null;

  async function handleSlotBook() {
    if (!selectedSlot) return;
    setSlotBooking(true);
    setSlotError("");
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: selectedSlot, clinicianId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSlotError(
          data.code === "slot_taken"
            ? "That slot was just taken — the list has been refreshed, please pick another."
            : "Booking failed. Please try again."
        );
        loadSlots(clinicianId);
        setSelectedSlot(null);
        return;
      }
      const doc = clinicians.find((c) => c.id === clinicianId);
      setSlotSuccess(`${formatSlotDay(selectedSlot)}, ${formatSlotTime(selectedSlot)}${doc ? ` with ${doc.name}` : ""}`);
      setSelectedSlot(null);
      loadSlots(clinicianId);
      load();
    } catch {
      setSlotError("Booking failed. Please try again.");
    } finally {
      setSlotBooking(false);
    }
  }

  function resetForm() {
    setBookingType("consultation");
    setMachineType("");
    setPreferredDate("");
    setNotes("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      const body: Record<string, unknown> = {
        bookingType,
        preferredDate: preferredDate || undefined,
        notes: notes || undefined,
      };
      if (bookingType === "machine" && machineType) {
        body.machineType = machineType;
      }
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        setSubmitError("Failed to submit booking. Please try again.");
        return;
      }
      resetForm();
      setShowForm(false);
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), BOOKING_SUCCESS_MS);
      load();
    } catch {
      setSubmitError("Failed to submit booking. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(bookingId: string) {
    setCancellingId(bookingId);
    try {
      await fetch(`/api/bookings/${bookingId}`, { method: "DELETE" });
      load();
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>
            My <em>Bookings</em>
          </h1>
          <p className={styles.pageSub}>Consultation requests and appointments</p>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={() => setShowForm(!showForm)}>
          + Request booking
        </button>
      </div>

      {/* Native slot picker — conflict-free, instantly confirmed */}
      <div className={`${styles.card} ${styles.cardGap}`}>
        <p className={styles.cardTitle}>Book an appointment</p>
        <p className={styles.formHint}>
          Pick a free time with {COMPANY.clinicianName} — confirmed instantly. Times are Zürich time.
        </p>
        {slotsLoading ? (
          <LoadingState lines={2} />
        ) : dayKeys.length === 0 ? (
          <p className={styles.meta}>
            No open slots at the moment — send a request below and {COMPANY.clinicianName} will find a time with you.
          </p>
        ) : (
          <>
            {clinicians.length > 1 && (
              <div className={bookingStyles.dayTabs} role="radiogroup" aria-label="Choose your clinician">
                {clinicians.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={c.id === clinicianId}
                    className={`${bookingStyles.dayTab}${c.id === clinicianId ? ` ${bookingStyles.dayTabActive}` : ""}`}
                    onClick={() => selectClinician(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            <div className={bookingStyles.dayTabs} role="tablist" aria-label="Available days">
              {dayKeys.map((day) => (
                <button
                  key={day}
                  type="button"
                  role="tab"
                  aria-selected={day === activeDay}
                  className={`${bookingStyles.dayTab}${day === activeDay ? ` ${bookingStyles.dayTabActive}` : ""}`}
                  onClick={() => { setSelectedDay(day); setSelectedSlot(null); }}
                >
                  {day}
                </button>
              ))}
            </div>
            <div className={bookingStyles.slotGrid}>
              {(activeDay ? slotsByDay.get(activeDay) ?? [] : []).map((iso) => (
                <button
                  key={iso}
                  type="button"
                  className={`${bookingStyles.slotBtn}${iso === selectedSlot ? ` ${bookingStyles.slotBtnActive}` : ""}`}
                  onClick={() => setSelectedSlot(iso === selectedSlot ? null : iso)}
                >
                  {formatSlotTime(iso)}
                </button>
              ))}
            </div>
            {selectedSlot && (
              <button
                type="button"
                className={`${styles.btnPrimary} ${styles.btnBlock} ${bookingStyles.slotConfirm}`}
                onClick={handleSlotBook}
                disabled={slotBooking}
              >
                {slotBooking
                  ? "Booking…"
                  : `Confirm ${formatSlotDay(selectedSlot)}, ${formatSlotTime(selectedSlot)}`}
              </button>
            )}
            {slotError && <p className={styles.formErrorTop}>{slotError}</p>}
          </>
        )}
      </div>

      {slotSuccess && (
        <div className={bookingStyles.successBanner}>
          <p className={bookingStyles.bannerTitle}>Appointment confirmed</p>
          <p>{slotSuccess}. A confirmation email is on its way — manage or cancel it below.</p>
        </div>
      )}

      {submitSuccess && (
        <div className={bookingStyles.successBanner}>
          <p className={bookingStyles.bannerTitle}>Booking request submitted</p>
          <p>{COMPANY.clinicianName} reviews all requests personally and will be in touch within 24 hours to confirm your appointment.</p>
        </div>
      )}

      {showForm && (
        <div className={`${styles.card} ${styles.cardGap}`}>
          <p className={styles.cardTitle}>Request a booking</p>
          <p className={styles.formHint}>
            {COMPANY.clinicianName} reviews every request personally. Include anything that helps him prepare — your Inflection Edge scores are already on file.
          </p>
          <form onSubmit={handleSubmit} className={styles.formStack}>
            {/* Booking type */}
            <div className={authStyles.field}>
              <label className={authStyles.label}>Type</label>
              <div className={bookingStyles.typeToggle}>
                {BOOKING_TYPE_VALUES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`${bookingStyles.typeBtn}${bookingType === t ? ` ${bookingStyles.typeBtnActive}` : ""}`}
                    onClick={() => { setBookingType(t); setMachineType(""); }}
                  >
                    {BOOKING_TYPE_CONFIG[t].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Machine type — only shown for technology sessions */}
            {bookingType === "machine" && (
              <div className={authStyles.field}>
                <label className={authStyles.label} htmlFor="machineType">Technology</label>
                <select
                  id="machineType"
                  className={authStyles.input}
                  value={machineType}
                  onChange={(e) => setMachineType(e.target.value as MachineType | "")}
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
              <input id="date" className={authStyles.input} type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} />
            </div>
            <div className={authStyles.field}>
              <label className={authStyles.label} htmlFor="notes">
                {bookingType === "machine" ? "Anything to prepare?" : "What would you like to focus on?"}
              </label>
              <textarea
                id="notes"
                className={styles.formTextarea}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
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
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className={styles.cancelBtn}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : loadError ? (
        <div className={styles.card}>
          <div className={styles.emptyState}>
            Could not load bookings.{" "}
            <button type="button" onClick={load} className={styles.retryBtn}>
              Retry
            </button>
          </div>
        </div>
      ) : bookings.length === 0 ? (
        <div className={styles.card}>
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>No bookings yet</p>
            <p>A discovery call is the fastest way to find out if {COMPANY.shortName} is right for you — 30 minutes with {COMPANY.clinicianName} to look at your Inflection Edge results and map out a programme.</p>
            <button
              type="button"
              className={styles.emptyAction}
              onClick={() => setShowForm(true)}
            >
              Request a booking →
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.listStack}>
          {bookings.map((b) => {
            const s = BOOKING_STATUS_CONFIG[b.status] ?? BOOKING_STATUS_CONFIG.pending;
            const typeLabel = BOOKING_TYPE_CONFIG[b.bookingType]?.label ?? b.bookingType;
            const machineLabel = b.machineType ? MACHINE_TYPE_CONFIG[b.machineType]?.label : null;
            return (
              <div key={b.id} className={styles.card}>
                <div className={bookingStyles.bookingItem}>
                  <div className={bookingStyles.bookingItemInfo}>
                    <p className={bookingStyles.bookingItemDate}>
                      {machineLabel ? `${typeLabel} — ${machineLabel}` : typeLabel}
                      {b.scheduledAt
                        ? ` · ${formatSlotDay(b.scheduledAt)}, ${formatSlotTime(b.scheduledAt)}${b.clinician?.name ? ` · ${b.clinician.name}` : ""}`
                        : b.preferredDate
                          ? ` · Preferred: ${formatDateLong(b.preferredDate)}`
                          : ""}
                    </p>
                    {b.notes && <p className={styles.meta}>{b.notes}</p>}
                    <p className={bookingStyles.bookingRequested}>
                      Requested {formatDateNumeric(b.createdAt)}
                    </p>
                  </div>
                  <div className={bookingStyles.bookingActions}>
                    <span className={`${styles.pill} ${s.badgeClass}`}>
                      {s.label}
                    </span>
                    {b.status === BOOKING_STATUS.pending && (
                      <button
                        type="button"
                        className={bookingStyles.cancelBookingBtn}
                        onClick={() => handleCancel(b.id)}
                        disabled={cancellingId === b.id}
                      >
                        {cancellingId === b.id ? "Cancelling…" : "Cancel"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
