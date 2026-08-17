// Notification type SSOT — a companion inbox to the existing email sends, not
// a replacement. Add a new key here before wiring a new trigger site; nothing
// else should define its own type string.

export const NOTIFICATION_TYPE = {
  newMessage: "newMessage",
  bookingRequested: "bookingRequested",
  bookingConfirmed: "bookingConfirmed",
  bookingCancelled: "bookingCancelled",
  criticalSignal: "criticalSignal",
  applicationDecision: "applicationDecision",
  goalAchieved: "goalAchieved",
  documentUploaded: "documentUploaded",
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

/** How many notifications a single list request returns. */
export const NOTIFICATION_PAGE_SIZE = 20;

/** Notifications older than this (or beyond the pagination window) simply fall
 *  out of the list — no cron deletion needed at current volume. */
export const NOTIFICATION_RETENTION_DAYS = 90;

export const NOTIFICATION_TITLE_MAX_LENGTH = 200;
export const NOTIFICATION_HREF_MAX_LENGTH = 300;
