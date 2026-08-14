// Booking status display config — SSOT for all status colors used across admin and portal

/** Canonical booking status values — used for Zod validation and UI filter options */
export const BOOKING_STATUS_VALUES = ["pending", "confirmed", "attended", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUS_VALUES)[number];

/** Named status constants for use in DB queries and logic — derived from BOOKING_STATUS_VALUES */
export const BOOKING_STATUS = {
  pending: "pending",
  confirmed: "confirmed",
  attended: "attended",
  cancelled: "cancelled",
} as const satisfies Record<BookingStatus, BookingStatus>;

/**
 * Calendar SEQUENCE per status. Subscribed calendars only apply an update when
 * SEQUENCE grows, and bookings carry no updatedAt column — status progression
 * is therefore the version counter (a cancellation must outrank every earlier
 * state or the appointment never disappears from the clinician's calendar).
 */
export const ICS_SEQUENCE_BY_STATUS: Record<BookingStatus, number> = {
  pending: 0,
  confirmed: 1,
  attended: 2,
  cancelled: 3,
};

/** Canonical booking type values */
export const BOOKING_TYPE_VALUES = ["consultation", "machine"] as const;
export type BookingType = (typeof BOOKING_TYPE_VALUES)[number];

export const BOOKING_TYPE_CONFIG: Record<BookingType, { label: string }> = {
  consultation: { label: "Consultation" },
  machine:      { label: "Technology Session" },
};

/** Canonical machine type values */
export const MACHINE_TYPE_VALUES = [
  "h2_therapy",
  "ihht",
  "pemf",
  "infrared",
  "hrv_biofeedback",
] as const;
export type MachineType = (typeof MACHINE_TYPE_VALUES)[number];

export const MACHINE_TYPE_CONFIG: Record<MachineType, { label: string }> = {
  h2_therapy:     { label: "H₂ Therapy" },
  ihht:           { label: "IHHT" },
  pemf:           { label: "PEMF" },
  infrared:       { label: "Infrared" },
  hrv_biofeedback:{ label: "HRV Biofeedback" },
};

/** Serialised booking row returned by API endpoints (dates are strings, not Date objects) */
export type BookingRow = {
  id: string;
  status: BookingStatus;
  bookingType: BookingType;
  machineType: MachineType | null;
  preferredDate: string | null;
  scheduledAt: string | null;
  clinician: { id: string; name: string | null } | null;
  notes: string | null;
  createdAt: string;
};

/** BookingRow extended with joined user data (admin-only endpoints) */
export type BookingRowWithUser = BookingRow & {
  user: { id: string; name: string | null; email: string };
};

export const BOOKING_STATUS_CONFIG: Record<BookingStatus, { label: string; badgeClass: string }> = {
  pending:   { label: "Pending",   badgeClass: "booking-status-pending"   },
  confirmed: { label: "Confirmed", badgeClass: "booking-status-confirmed" },
  attended:  { label: "Attended",  badgeClass: "booking-status-attended"  },
  cancelled: { label: "Cancelled", badgeClass: "booking-status-cancelled" },
};
