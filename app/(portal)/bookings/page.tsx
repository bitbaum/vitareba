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
import { formatDateLong, formatDateNumeric } from "@/lib/utils/format";
import { COMPANY } from "@/lib/config/company";
import { CALENDLY_URL, BOOKING_SUCCESS_MS, BOOKING_NOTES_MAX_LENGTH } from "@/lib/config/portal";
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
        <button type="button" className={`${authStyles.submit} ${styles.headerBtn}`} onClick={() => setShowForm(!showForm)}>
          + Request booking
        </button>
      </div>

      {/* Calendly shortcut */}
      {CALENDLY_URL && (
        <div className={bookingStyles.calendlyBanner}>
          <div>
            <p className={bookingStyles.calendlyBannerTitle}>
              Book directly with {COMPANY.clinicianName}
            </p>
            <p className={bookingStyles.calendlyBannerSub}>
              Pick a time — instant confirmation
            </p>
          </div>
          <a
            href={CALENDLY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`btn-dark ${styles.ctaBtnSmall}`}
          >
            Book on Calendly →
          </a>
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
                className={`${authStyles.submit} ${styles.formActionPrimary}`}
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
                      {b.preferredDate ? ` · Preferred: ${formatDateLong(b.preferredDate)}` : ""}
                    </p>
                    {b.notes && <p className={bookingStyles.bookingNotes}>{b.notes}</p>}
                    <p className={bookingStyles.bookingRequested}>
                      Requested {formatDateNumeric(b.createdAt)}
                    </p>
                  </div>
                  <div className={bookingStyles.bookingActions}>
                    <span className={`${bookingStyles.bookingBadge} ${s.badgeClass}`}>
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
