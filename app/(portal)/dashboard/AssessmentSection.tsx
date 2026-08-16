import Link from "next/link";
import shared from "../portal.module.css";
import styles from "./dashboard.module.css";
import { DIMENSIONS, getVerdict, scoreClass, type AssessmentRow } from "@/lib/assessment/data";
import { PORTAL_ROUTES } from "@/lib/config/routes";
import { BOOKING_STATUS_CONFIG, type BookingStatus } from "@/lib/config/booking-status";
import { formatAppointment, formatDateLong } from "@/lib/utils/format";
import { COMPANY } from "@/lib/config/company";

interface AssessmentSectionProps {
  latestAssessment: AssessmentRow | null | undefined;
  previousAssessment?: AssessmentRow | null;
  /**
   * Includes scheduledAt DELIBERATELY. This was Pick<"status" | "preferredDate">,
   * so the card could not see the appointment's actual time even when one
   * existed — it rendered "17 August 2026" for a 17:00 consultation, and no type
   * error was possible because the field simply was not in scope.
   *
   * Written out rather than Pick<BookingRow>: BookingRow is the SERIALISED API
   * shape where dates are strings, and this component is fed a database row
   * where they are Dates. Borrowing the wrong one is how the mismatch hid.
   */
  latestBooking:
    | {
        status: BookingStatus;
        preferredDate: string | null;
        scheduledAt: Date | string | null;
        clinician?: { name: string | null } | null;
      }
    | null
    | undefined;
  threadCount: number;
  unreadMessageCount?: number;
  /** Resolved from care_team by the page — never a name from config. */
  clinician?: string;
}

function getLowestDimension(scores: Record<string, number>) {
  return DIMENSIONS.reduce((min, dim) =>
    (scores[dim.id] ?? 0) < (scores[min.id] ?? 0) ? dim : min
  );
}

export function AssessmentSection({
  latestAssessment,
  previousAssessment,
  latestBooking,
  threadCount,
  unreadMessageCount = 0,
  clinician = COMPANY.clinicianFallback,
}: AssessmentSectionProps) {
  if (!latestAssessment) {
    // The next-step funnel (NextStepCard) already carries the assessment CTA.
    return null;
  }

  const verdict = getVerdict(latestAssessment.overallScore);
  const scores = latestAssessment.scores as Record<string, number> | undefined;
  const lowestDim = scores ? getLowestDimension(scores) : null;
  const delta =
    previousAssessment != null
      ? latestAssessment.overallScore - previousAssessment.overallScore
      : null;

  return (
    <>
      {/* Assessment result hero card */}
      <div className={styles.heroCard}>
        <div className={styles.heroCardHead}>
          <div>
            <p className={styles.heroEyebrow}>Inflection Edge</p>
            <p className={styles.heroTitle}>{verdict.name}</p>
          </div>
          <div className={styles.scoreBlock}>
            <span
              className={`${shared.statValue} ${shared.statXl} ${scoreClass(latestAssessment.overallScore)}`}
            >
              {latestAssessment.overallScore}
            </span>
            <p className={styles.scoreDenom}>/ 100</p>
            {delta !== null && (
              <p className={delta >= 0 ? styles.scoreDeltaUp : styles.scoreDeltaDown}>
                {delta >= 0 ? `↑ +${delta}` : `↓ ${delta}`} since last
              </p>
            )}
          </div>
        </div>
        {/* Verdict interpretation lives on /assessments — the dashboard stays glanceable */}
        <div className={styles.heroLinks}>
          <Link href={PORTAL_ROUTES.assessments} className={styles.heroLinkPrimary}>
            Full results →
          </Link>
          <Link href={PORTAL_ROUTES.assessment} className={styles.heroLinkMuted}>
            Retake assessment
          </Link>
        </div>
      </div>

      <div className={shared.grid2}>
        {/* Highest-leverage intervention area */}
        {lowestDim && scores && (
          <div className={shared.cardWarn}>
            <p className={shared.cardTitle}>Highest-leverage area</p>
            <p className={styles.interventionName}>
              {lowestDim.icon} {lowestDim.name}
            </p>
            <p
              className={`${shared.statValue} ${shared.statLg} ${styles.interventionScore} ${scoreClass(scores[lowestDim.id] ?? 0)}`}
            >
              {scores[lowestDim.id] ?? 0}
            </p>
            <Link href={PORTAL_ROUTES.assessments} className={styles.cardLink}>
              Read full interpretation →
            </Link>
          </div>
        )}

        {/* Consultation card */}
        <div className={shared.card}>
          <p className={shared.cardTitle}>Consultation</p>
          {latestBooking ? (
            <>
              {(() => {
                const s =
                  BOOKING_STATUS_CONFIG[latestBooking.status] ?? BOOKING_STATUS_CONFIG.pending;
                return (
                  <span className={`${shared.pill} ${s.badgeClass}`}>
                    {s.label}
                  </span>
                );
              })()}
              {latestBooking.scheduledAt ? (
                <p className={styles.bookingDate}>
                  {formatAppointment(latestBooking.scheduledAt)}
                  {latestBooking.clinician?.name ? ` · ${latestBooking.clinician.name}` : ""}
                </p>
              ) : latestBooking.preferredDate ? (
                <p className={styles.bookingDate}>
                  You asked for {formatDateLong(latestBooking.preferredDate)}
                </p>
              ) : null}
              <Link href={PORTAL_ROUTES.bookings} className={styles.cardLink}>
                View bookings →
              </Link>
            </>
          ) : (
            <>
              <p className={styles.bookingNoAppt}>
                A direct conversation with {clinician} — no commitment.
              </p>
              <Link href={PORTAL_ROUTES.bookings} className={`btn-dark ${shared.ctaBtnSmall}`}>
                Book a call →
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Messages row */}
      {threadCount > 0 && (
        <div className={`${styles.messagesRow}${unreadMessageCount > 0 ? ` ${styles.messagesRowUnread}` : ""}`}>
          <div>
            <p className={shared.cardTitle}>Messages</p>
            <p className={styles.messagesBody}>
              {/* Deliberately unattributed: any care-team member can reply, and
                  this row does not know which one did. Naming the primary
                  clinician here would be a guess shown as a fact. */}
              {unreadMessageCount > 0
                ? `${unreadMessageCount === 1 ? "A reply is" : `${unreadMessageCount} replies are`} waiting — open to read`
                : `${threadCount} active thread${threadCount !== 1 ? "s" : ""} with the ${COMPANY.shortName} team`}
            </p>
          </div>
          <Link href={PORTAL_ROUTES.messages} className={`${styles.cardLink} ${styles.noWrap}`}>
            {unreadMessageCount > 0 ? "Read reply →" : "Open messages →"}
          </Link>
        </div>
      )}
    </>
  );
}
