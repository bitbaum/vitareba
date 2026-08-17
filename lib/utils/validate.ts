/** UUID v4 regex — use this instead of re-defining inline in routes */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 24-hour wall-clock time, "HH:MM" — the format ClinicianAvailability.weeklyHours windows are stored in. */
export const TIME_HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
