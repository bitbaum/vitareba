import Link from "next/link";
import styles from "./dashboard.module.css";
import { PORTAL_ROUTES } from "@/lib/config/routes";
import { streakMessage } from "@/lib/domain/checkin";
import { CHECKIN_METRICS, type MetricKey } from "@/lib/config/portal";

type TodayScores = Record<MetricKey, number>;

/**
 * Today's check-in status — rendered only once the check-in is DONE.
 * The "go check in" prompt lives in the next-step funnel (NextStepCard),
 * so this card never has to sell the action, just show the result.
 */
export function CheckinCard({
  streak,
  todayScores,
  todayNote,
}: {
  streak: number;
  todayScores?: TodayScores;
  todayNote?: string;
}) {
  return (
    <div className={styles.checkinDone}>
      <span className={styles.checkinDoneCheck}>✓</span>
      <div className={styles.checkinDoneBody}>
        <p className={styles.checkinDoneLabel}>Check-in done</p>
        <p className={styles.checkinDoneText}>{streakMessage(streak)}</p>
        {todayScores && (
          <div className={styles.checkinScoreRow}>
            {CHECKIN_METRICS.map(({ key, shortLabel }) => (
              <span key={key} className={styles.checkinScoreChip}>
                <span className={styles.checkinScoreLabel}>{shortLabel}</span>
                <span className={styles.checkinScoreValue}>{todayScores[key as MetricKey]}</span>
              </span>
            ))}
          </div>
        )}
        {todayNote && <p className={styles.checkinNotePreview}>{todayNote}</p>}
      </div>
      <Link href={PORTAL_ROUTES.checkin} className={`${styles.cardLinkMuted} ${styles.noWrap}`}>
        Edit →
      </Link>
    </div>
  );
}
