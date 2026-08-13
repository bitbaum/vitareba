"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import styles from "../../admin.module.css";
import {
  BOOKING_STATUS, BOOKING_STATUS_CONFIG, BOOKING_STATUS_VALUES,
  BOOKING_TYPE_CONFIG, MACHINE_TYPE_CONFIG,
  type BookingRowWithUser, type BookingStatus,
} from "@/lib/config/booking-status";
import { formatDateShort, formatDateNumeric, formatSlotDay, formatSlotTime } from "@/lib/utils/format";
import { ADMIN_ROUTES } from "@/lib/config/routes";
import { LoadingState } from "@/components/LoadingState";


// "upcoming" answers the clinician's daily question — who am I seeing next? —
// and is the default: slot bookings are born confirmed, so the old "pending"
// default showed an empty list on a normal day.
const FILTER_OPTIONS = ["upcoming", "all", ...BOOKING_STATUS_VALUES] as const;
type FilterOption = (typeof FILTER_OPTIONS)[number];

const ACTIVE_STATUSES: BookingStatus[] = [BOOKING_STATUS.pending, BOOKING_STATUS.confirmed];

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<BookingRowWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterOption>("upcoming");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
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

  async function updateStatus(id: string, status: BookingStatus) {
    setUpdating(id);
    setError("");
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!data.success) setError("Failed to update booking status.");
      load();
    } catch {
      setError("Failed to update booking status.");
    } finally {
      setUpdating(null);
    }
  }

  const now = Date.now();
  const upcoming = bookings
    .filter((b) => b.scheduledAt && new Date(b.scheduledAt).getTime() >= now && ACTIVE_STATUSES.includes(b.status))
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
  const filtered =
    filter === "upcoming"
      ? upcoming
      : filter === "all"
        ? bookings
        : bookings.filter((b) => b.status === (filter as BookingStatus));
  const pendingCount = bookings.filter((b) => b.status === BOOKING_STATUS.pending).length;

  return (
    <div>
      <h1 className={styles.pageTitle}>
        <em>Bookings</em>
      </h1>
      <p className={styles.pageSub}>
        {loading
          ? "Loading…"
          : upcoming.length > 0
            ? `Next: ${formatSlotDay(upcoming[0].scheduledAt!)}, ${formatSlotTime(upcoming[0].scheduledAt!)} — ${upcoming[0].user.name ?? upcoming[0].user.email} · ${upcoming.length} upcoming · ${pendingCount} pending`
            : `No upcoming appointments · ${bookings.length} total · ${pendingCount} pending`}
      </p>

      <div className={styles.filterBar}>
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`${styles.filterTab}${filter === f ? ` ${styles.filterTabActive}` : ""}`}
          >
            {f}{f === BOOKING_STATUS.pending && pendingCount > 0 ? ` (${pendingCount})` : ""}
          </button>
        ))}
      </div>

      {error && <p className={styles.formErrorMb}>{error}</p>}

      {loading ? (
        <LoadingState />
      ) : loadError ? (
        <div className={styles.emptyState}>Failed to load bookings. Please refresh the page.</div>
      ) : filtered.length === 0 ? (
        <div className={styles.card}>
          <div className={styles.emptyState}>
            {filter === "upcoming"
              ? "No upcoming appointments — your calendar is clear."
              : `No ${filter === "all" ? "" : filter} bookings.`}
          </div>
        </div>
      ) : (
        <div className={styles.card}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Type</th>
                <th>Preferred date</th>
                <th>Notes</th>
                <th>Requested</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const s = BOOKING_STATUS_CONFIG[b.status] ?? BOOKING_STATUS_CONFIG.pending;
                const isUpdating = updating === b.id;
                return (
                  <tr key={b.id}>
                    <td>
                      <div className={styles.cellName}>
                        {b.user.name ?? <span className={styles.cellMuted}>No name</span>}
                      </div>
                      <div className={styles.cellSub}>{b.user.email}</div>
                      <Link href={`${ADMIN_ROUTES.patients}/${b.user.id}`} className={styles.cellLink}>
                        View patient →
                      </Link>
                    </td>
                    <td className={styles.cellNowrap}>
                      <div>{BOOKING_TYPE_CONFIG[b.bookingType]?.label ?? b.bookingType}</div>
                      {b.machineType && (
                        <div className={styles.cellSub}>{MACHINE_TYPE_CONFIG[b.machineType]?.label}</div>
                      )}
                    </td>
                    <td className={styles.cellNowrap}>
                      {b.scheduledAt
                        ? `${formatSlotDay(b.scheduledAt)}, ${formatSlotTime(b.scheduledAt)}`
                        : b.preferredDate
                          ? formatDateShort(b.preferredDate)
                          : <span className={styles.cellMuted}>—</span>}
                    </td>
                    <td className={styles.tdNotes}>
                      {b.notes ? (
                        <span className={styles.cellTextAlt}>{b.notes}</span>
                      ) : (
                        <span className={styles.cellMuted}>—</span>
                      )}
                    </td>
                    <td className={styles.cellNowrap}>
                      {formatDateNumeric(b.createdAt)}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${s.badgeClass}`}>
                        {s.label}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actionGroup}>
                        {b.status === BOOKING_STATUS.pending && (
                          <button
                            type="button"
                            onClick={() => updateStatus(b.id, BOOKING_STATUS.confirmed)}
                            disabled={isUpdating}
                            aria-label={`Confirm booking for ${b.user.name ?? b.user.email}`}
                            className={styles.actionBtnConfirm}
                          >
                            Confirm
                          </button>
                        )}
                        {b.status === BOOKING_STATUS.confirmed && (
                          <button
                            type="button"
                            onClick={() => updateStatus(b.id, BOOKING_STATUS.attended)}
                            disabled={isUpdating}
                            aria-label={`Mark attended for ${b.user.name ?? b.user.email}`}
                            className={styles.actionBtnAttended}
                          >
                            Attended
                          </button>
                        )}
                        {b.status !== BOOKING_STATUS.cancelled && b.status !== BOOKING_STATUS.attended && (
                          <button
                            type="button"
                            onClick={() => updateStatus(b.id, BOOKING_STATUS.cancelled)}
                            disabled={isUpdating}
                            aria-label={`Cancel booking for ${b.user.name ?? b.user.email}`}
                            className={styles.actionBtnCancel}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
