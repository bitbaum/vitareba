"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import styles from "../portal.module.css";
import bookingStyles from "./bookings.module.css";
import authStyles from "../../forms.module.css";
import {
  BOOKING_STATUS_CONFIG,
  BOOKING_TYPE_CONFIG,
  BOOKING_TYPE_VALUES,
  MACHINE_TYPE_CONFIG,
  MACHINE_TYPE_VALUES,
  type BookingRow,
  type BookingType,
  type MachineType,
} from "@/lib/config/booking-status";
import { formatAppointment, formatDateLong, formatSlotDay, formatSlotTime, slotParts } from "@/lib/utils/format";
import { COMPANY } from "@/lib/config/company";
import { DAY_PARTS, DEFAULT_AVAILABILITY } from "@/lib/config/scheduling";
import { BOOKING_SUCCESS_MS, BOOKING_NOTES_MAX_LENGTH } from "@/lib/config/portal";
import { LoadingState } from "@/components/LoadingState";
import { BookingActions, type ActionableBooking } from "@/components/clinical/BookingActions";
import { CANCELLATION_POLICY } from "@/lib/config/cancellation";
import { CLINIC_LOCATION } from "@/lib/domain/booking-calendar";

// Shown until the server reports the selected clinician's real slot length.
const DEFAULT_SLOT_MINUTES = DEFAULT_AVAILABILITY.slotMinutes;

/** Two-letter monogram for the clinician avatar; falls back to a neutral mark. */
function initials(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}


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
  const [clinicians, setClinicians] = useState<
    { id: string; name: string | null; acceptingPatients: boolean }[]
  >([]);
  const [clinicianId, setClinicianId] = useState<string | null>(null);
  const [careTeam, setCareTeam] = useState<string[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [slotMinutes, setSlotMinutes] = useState(DEFAULT_SLOT_MINUTES);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slotBooking, setSlotBooking] = useState(false);
  const [slotError, setSlotError] = useState("");
  const [slotSuccess, setSlotSuccess] = useState<string | null>(null);
  // When set, the picker is moving an existing appointment rather than making a
  // new one. Same picker, same slots, same conflict rules — a second "reschedule"
  // screen would be a second implementation of the thing that just started working.
  const [movingBooking, setMovingBooking] = useState<ActionableBooking | null>(null);
  const confirmationRef = useRef<HTMLDivElement | null>(null);

  const loadSlots = useCallback(async (forClinician?: string | null) => {
    try {
      const qs = forClinician ? `?clinicianId=${forClinician}` : "";
      const res = await fetch(`/api/bookings/slots${qs}`);
      if (!res.ok) return;
      const data = await res.json();
      setSlots(data.data ?? []);
      setClinicians(data.clinicians ?? []);
      setClinicianId(data.clinicianId ?? null);
      setCareTeam(data.careTeam ?? []);
      setSelfId(data.selfId ?? null);
      if (data.slotMinutes) setSlotMinutes(data.slotMinutes);
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
  const activeSlots = activeDay ? slotsByDay.get(activeDay) ?? [] : [];

  // Within a day, split into morning / afternoon / evening so the grid reads
  // as a schedule instead of an undifferentiated wall of times.
  const partedSlots = DAY_PARTS.map((part, i) => {
    const fromHour = i === 0 ? 0 : DAY_PARTS[i - 1].untilHour;
    return {
      ...part,
      slots: activeSlots.filter((iso) => {
        const { hour } = slotParts(iso);
        return hour >= fromHour && hour < part.untilHour;
      }),
    };
  }).filter((p) => p.slots.length > 0);

  const selectedClinician = clinicians.find((c) => c.id === clinicianId) ?? null;
  const clinicianLabel = selectedClinician?.name ?? "your clinician";
  // Same rule the server enforces (canPatientChooseClinician) — reflected here
  // so the button is honest before it is clicked, not a way to skip a round trip.
  const selectedClinicianClosed =
    !!selectedClinician &&
    !selectedClinician.acceptingPatients &&
    !careTeam.includes(selectedClinician.id) &&
    selectedClinician.id !== selfId;

  async function handleSlotBook() {
    if (!selectedSlot) return;
    setSlotBooking(true);
    setSlotError("");
    try {
      // Moving an appointment PATCHes the one that exists; booking a new one
      // POSTs. Both end at the same engine re-check and the same unique index.
      const res = movingBooking
        ? await fetch(`/api/bookings/${movingBooking.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slot: selectedSlot, clinicianId }),
          })
        : await fetch("/api/bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slot: selectedSlot, clinicianId }),
          });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSlotError(
          data.code === "slot_taken"
            ? "That slot was just taken — the list has been refreshed, please pick another."
            // The server is the authority here, not just the disabled button
            // above — a doctor can close intake between page load and click,
            // and that message ("not accepting new patients right now") is
            // more useful than a generic failure.
            : (data.error ?? "Booking failed. Please try again.")
        );
        loadSlots(clinicianId);
        setSelectedSlot(null);
        return;
      }
      const doc = clinicians.find((c) => c.id === clinicianId);
      setSlotSuccess(`${formatSlotDay(selectedSlot)}, ${formatSlotTime(selectedSlot)}${doc ? ` with ${doc.name}` : ""}`);
      setMovingBooking(null);
      setSelectedSlot(null);
      loadSlots(clinicianId);
      load();
      // Take them to the confirmation. It renders BELOW the picker, so on a
      // laptop the only visible effect of pressing Confirm was a time quietly
      // vanishing from the list — which reads as a failure, not a booking.
      // The banner and the new appointment are the answer; show them.
      requestAnimationFrame(() => {
        confirmationRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
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
        <p className={styles.cardTitle}>
          {movingBooking ? "Move your appointment" : "Book an appointment"}
        </p>
        {movingBooking && (
          <p className={styles.formHint}>
            Choosing a time moves your existing appointment — you will not end up with two.
            You can pick a different clinician above as well.{" "}
            <button type="button" className={styles.btnText} onClick={() => setMovingBooking(null)}>
              Keep the current time
            </button>
          </p>
        )}
        {slotsLoading ? (
          <LoadingState lines={2} />
        ) : (
          <>
            {clinicians.length > 0 && (
              <div className={bookingStyles.pickerStep}>
                <p className={bookingStyles.stepLabel}>1 · Who you&apos;d like to see</p>
                <div className={bookingStyles.clinicianRow} role="radiogroup" aria-label="Choose your clinician">
                  {clinicians.map((c) => {
                    const active = c.id === clinicianId;
                    const mine = careTeam.includes(c.id);
                    // Still browsable — seeing when a closed doctor would have
                    // room is useful on its own, and the clinic may take a
                    // patient by exception. Confirming a NEW booking with them
                    // is what the server (and the button below) refuses.
                    // A dual-role clinician can always book themselves
                    // regardless of their own intake setting — caught live:
                    // without this exemption, George's own card read "not
                    // accepting" against himself.
                    const closedToMe = !c.acceptingPatients && !mine && c.id !== selfId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={`${bookingStyles.clinicianCard}${active ? ` ${bookingStyles.clinicianCardActive}` : ""}${closedToMe ? ` ${bookingStyles.clinicianCardClosed}` : ""}`}
                        onClick={() => selectClinician(c.id)}
                      >
                        <span className={bookingStyles.clinicianAvatar} aria-hidden="true">
                          {initials(c.name)}
                        </span>
                        <span className={bookingStyles.clinicianText}>
                          <span className={bookingStyles.clinicianName}>
                            {c.name ?? "Clinician"}
                            {mine && <span className={bookingStyles.clinicianBadge}>Your clinician</span>}
                            {closedToMe && (
                              <span className={bookingStyles.clinicianBadgeWarn}>Not accepting new patients</span>
                            )}
                          </span>
                          <span className={bookingStyles.clinicianMeta}>
                            {closedToMe
                              ? "Viewing only — contact the clinic to book"
                              : active
                                ? dayKeys.length > 0
                                  ? `Next free: ${dayKeys[0]}`
                                  : "No open times right now"
                                : "See available times"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {dayKeys.length === 0 ? (
              <p className={styles.meta}>
                No open slots with {clinicianLabel} at the moment — send a request below and the clinic will find a time with you.
              </p>
            ) : (
              <>
                <div className={bookingStyles.pickerStep}>
                  <p className={bookingStyles.stepLabel}>2 · Pick a day</p>
                  <div className={bookingStyles.dateRail} role="tablist" aria-label="Available days">
                    {dayKeys.map((day) => {
                      const daySlots = slotsByDay.get(day) ?? [];
                      const { weekday, day: dayNum, month } = slotParts(daySlots[0]);
                      const active = day === activeDay;
                      return (
                        <button
                          key={day}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          className={`${bookingStyles.dateCell}${active ? ` ${bookingStyles.dateCellActive}` : ""}`}
                          onClick={() => { setSelectedDay(day); setSelectedSlot(null); }}
                        >
                          <span className={bookingStyles.dateWeekday}>{weekday}</span>
                          <span className={bookingStyles.dateDay}>{dayNum}</span>
                          <span className={bookingStyles.dateMonth}>{month}</span>
                          <span className={bookingStyles.dateCount}>
                            {daySlots.length} free
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={bookingStyles.pickerStep}>
                  <p className={bookingStyles.stepLabel}>3 · Choose a time</p>
                  {partedSlots.map((part) => (
                    <div key={part.id} className={bookingStyles.partGroup}>
                      <p className={bookingStyles.partLabel}>{part.label}</p>
                      <div className={bookingStyles.slotGrid}>
                        {part.slots.map((iso) => (
                          <button
                            key={iso}
                            type="button"
                            aria-pressed={iso === selectedSlot}
                            className={`${bookingStyles.slotBtn}${iso === selectedSlot ? ` ${bookingStyles.slotBtnActive}` : ""}`}
                            onClick={() => setSelectedSlot(iso === selectedSlot ? null : iso)}
                          >
                            {formatSlotTime(iso)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  className={`${bookingStyles.confirmBar}${selectedSlot ? ` ${bookingStyles.confirmBarPinned}` : ""}`}
                >
                  <div>
                    <p className={bookingStyles.confirmSummary}>
                      {selectedSlot
                        ? `${formatSlotDay(selectedSlot)} at ${formatSlotTime(selectedSlot)}`
                        : "Select a time to continue"}
                    </p>
                    <p className={bookingStyles.confirmMeta}>
                      {slotMinutes} min with {clinicianLabel} · Zürich time
                      {selectedSlot ? " · calendar invite included" : ""}
                    </p>
                    <p className={bookingStyles.confirmMeta}>{CANCELLATION_POLICY.summary}</p>
                  </div>
                  <button
                    type="button"
                    className={`${styles.btnPrimary} ${bookingStyles.confirmBtn}`}
                    onClick={handleSlotBook}
                    disabled={!selectedSlot || slotBooking || selectedClinicianClosed}
                  >
                    {selectedClinicianClosed
                      ? "Not accepting new patients"
                      : slotBooking
                        ? movingBooking
                          ? "Moving…"
                          : "Booking…"
                        : movingBooking
                          ? "Move to this time"
                          : "Confirm appointment"}
                  </button>
                </div>
              </>
            )}
            {slotError && <p className={styles.formErrorTop}>{slotError}</p>}
          </>
        )}
      </div>

      <div ref={confirmationRef} />

      {slotSuccess && (
        <div className={bookingStyles.successBanner}>
          <p className={bookingStyles.bannerTitle}>Appointment booked</p>
          <p>{slotSuccess}. A confirmation email is on its way — manage or cancel it below.</p>
        </div>
      )}

      {submitSuccess && (
        <div className={bookingStyles.successBanner}>
          <p className={bookingStyles.bannerTitle}>Booking request submitted</p>
          <p>A clinician reviews every request personally and will be in touch within 24 hours to confirm your appointment.</p>
        </div>
      )}

      {showForm && (
        <div className={`${styles.card} ${styles.cardGap}`}>
          <p className={styles.cardTitle}>Request a booking</p>
          <p className={styles.formHint}>
            Use this when none of the times above work. A clinician reviews every request personally —
            include anything that helps them prepare; your Inflection Edge scores are already on file.
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
            <p>A discovery call is the fastest way to find out if {COMPANY.shortName} is right for you — {slotMinutes} minutes with {clinicianLabel} to look at your Inflection Edge results and map out a programme.</p>
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
                      onChanged={load}
                      onMove={(target) => {
                        setMovingBooking(target);
                        setSelectedSlot(null);
                        setSlotSuccess(null);
                        // Otherwise "Move" on a George appointment could open
                        // Manuel's calendar, and silently hand the patient to a
                        // different doctor the moment they pick a time.
                        if (target.clinicianId && target.clinicianId !== clinicianId) {
                          selectClinician(target.clinicianId);
                        }
                        if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    />
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
