/**
 * SSOT for external calendar subscription.
 *
 * The shape of this feature is one decision: VitaReBa READS a calendar and never
 * writes one. A clinician pastes the private "secret address in iCal format"
 * URL their calendar app already publishes, and their real life starts blocking
 * slots. No OAuth application to register, no vendor to depend on, nothing to
 * pay, and it works the same for Google, Apple, Outlook and Nextcloud.
 *
 * The cost of that choice is honest and worth stating: changes take up to one
 * refresh interval to appear, and VitaReBa cannot put its own appointments into
 * the clinician's calendar. The second is already solved the other way — every
 * confirmation email carries an .ics invite, and there is a subscribable feed.
 */

/** How far ahead busy time is read and cached. Matches the booking horizon with room. */
export const CALENDAR_SYNC_HORIZON_DAYS = 60;

/**
 * How stale cached busy time may be before the sync job refreshes it.
 *
 * Fifteen minutes is the number every calendar host converges on for its own
 * subscription polling, and it is the right trade here too: a meeting accepted
 * this minute can still be double-booked for a quarter of an hour, which is
 * rare and recoverable, while polling every minute would get the clinic rate-
 * limited and then it would refresh far less often than this.
 */
export const CALENDAR_REFRESH_MINUTES = 15;

/** Give up on a feed that will not answer — one slow host must not stall the job. */
export const CALENDAR_FETCH_TIMEOUT_MS = 15_000;

/**
 * Largest feed we will read. A calendar with a decade of history is a real
 * thing; parsing 50 MB of it on a shared box is not.
 */
export const CALENDAR_MAX_BYTES = 5 * 1024 * 1024;

/** How many calendars one clinician may subscribe. Work, personal, on-call. */
export const CALENDAR_MAX_PER_CLINICIAN = 5;

export const CALENDAR_LABEL_MAX = 60;

/**
 * Schemes we will fetch. Calendar apps hand out https URLs, and some hand out
 * `webcal://`, which is https wearing a different hat.
 */
export const CALENDAR_ALLOWED_SCHEMES = ["https:", "webcal:"] as const;
