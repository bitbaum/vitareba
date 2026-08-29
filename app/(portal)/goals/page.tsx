import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clinicalGoals, profiles } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import Link from "next/link";
import styles from "../portal.module.css";
import goalStyles from "./goals.module.css";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";
import { PORTAL_ROUTES } from "@/lib/config/routes";
import { computeGoalProgress, goalProgressLabel } from "@/lib/domain/goals";
import {
  CHECKIN_METRICS,
  ASSESSMENT_GOAL_METRIC_KEY,
  ASSESSMENT_GOAL_METRIC_LABEL,
  goalMetricAutoUpdateNote,
} from "@/lib/config/portal";
import { formatDateLong } from "@/lib/utils/format";

/** Map check-in metric keys + assessment metric to human-readable labels for goal display */
const METRIC_LABELS: Record<string, string> = {
  ...Object.fromEntries(CHECKIN_METRICS.map((m) => [m.key, m.label])),
  [ASSESSMENT_GOAL_METRIC_KEY]: ASSESSMENT_GOAL_METRIC_LABEL,
};

export default async function GoalsPage() {
  const session = await auth();
  if (!session) return null;

  const now = new Date();
  let goals: Awaited<ReturnType<typeof db.query.clinicalGoals.findMany>> = [];
  let loadError = false;
  try {
    // Mark goals as seen in parallel with fetching them — clears the nav badge
    [goals] = await Promise.all([
      db.query.clinicalGoals.findMany({
        where: eq(clinicalGoals.patientId, session.user.id),
        orderBy: [asc(clinicalGoals.createdAt)],
      }),
      db
        .insert(profiles)
        .values({ userId: session.user.id, goalsSeenAt: now })
        .onConflictDoUpdate({ target: profiles.userId, set: { goalsSeenAt: now } })
        .catch(() => {
          /* non-critical — badge simply stays until next visit */
        }),
    ]);
  } catch {
    loadError = true;
  }

  const active = goals.filter((g) => !g.completedAt);
  const completed = goals.filter((g) => g.completedAt);

  return (
    <div>
      <PortalPageHeader
        title={
          <>
            My <em>Goals</em>
          </>
        }
        subtitle="Clinical goals set by your clinician — updated as you progress."
      />

      {loadError ? (
        <div className={`${styles.card} ${styles.emptyState}`}>
          Couldn&apos;t load your goals right now — please refresh.
        </div>
      ) : goals.length === 0 ? (
        <div className={`${styles.card} ${styles.emptyState}`}>
          <p className={styles.emptyTitle}>No goals set yet</p>
          <p className={styles.emptyBody}>
            Your clinician will add clinical goals after your first consultation. They&apos;ll
            appear here with progress tracking linked to your check-ins and assessments.
          </p>
          <Link href={PORTAL_ROUTES.bookings} className={styles.emptyAction}>
            Book a consultation →
          </Link>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className={goalStyles.section}>
              <p className={styles.sectionLabel}>Active goals</p>
              <div className={styles.listStack}>
                {active.map((goal) => {
                  const pct = computeGoalProgress(goal.baseline, goal.current, goal.target);
                  const hasNumbers =
                    goal.baseline != null || goal.current != null || goal.target != null;
                  const metricLabel = goal.metric
                    ? (METRIC_LABELS[goal.metric] ?? goal.metric)
                    : null;
                  const autoUpdateNote = goalMetricAutoUpdateNote(goal.metric);

                  return (
                    <div key={goal.id} className={`${styles.card} ${goalStyles.goalCard}`}>
                      <p className={goalStyles.goalTitle}>{goal.title}</p>

                      {metricLabel && (
                        <p className={styles.meta}>
                          Linked metric:{" "}
                          <span className={goalStyles.goalMetaValue}>{metricLabel}</span>
                          {autoUpdateNote && (
                            <span className={goalStyles.autoUpdateNote}> · {autoUpdateNote}</span>
                          )}
                        </p>
                      )}

                      {hasNumbers && (
                        <div className={goalStyles.progressSection}>
                          {pct !== null ? (
                            <>
                              <div className={styles.progressTrack}>
                                <div className={styles.progressFill} style={{ width: `${pct}%` }} />
                              </div>
                              <p className={styles.progressLabel}>{goalProgressLabel(pct)}</p>
                            </>
                          ) : null}

                          <div className={goalStyles.scoreRow}>
                            {goal.baseline != null && (
                              <span className={goalStyles.scoreChip}>
                                <span className={goalStyles.scoreChipLabel}>Baseline</span>
                                <span className={goalStyles.scoreChipValue}>{goal.baseline}</span>
                              </span>
                            )}
                            {goal.current != null && (
                              <span className={goalStyles.scoreChip}>
                                <span className={goalStyles.scoreChipLabel}>Current</span>
                                <span className={goalStyles.scoreChipValue}>{goal.current}</span>
                              </span>
                            )}
                            {goal.target != null && (
                              <span className={goalStyles.scoreChip}>
                                <span className={goalStyles.scoreChipLabel}>Target</span>
                                <span className={goalStyles.scoreChipValue}>{goal.target}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {goal.notes && <p className={goalStyles.goalNotes}>{goal.notes}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {completed.length > 0 && (
            <div className={goalStyles.section}>
              <p className={styles.sectionLabel}>Completed goals</p>
              <div className={styles.listStack}>
                {completed.map((goal) => (
                  <div key={goal.id} className={`${styles.card} ${goalStyles.goalCardCompleted}`}>
                    <div className={goalStyles.completedHeader}>
                      <p className={goalStyles.goalTitle}>{goal.title}</p>
                      <span className={styles.pillTeal}>Completed</span>
                    </div>
                    {goal.completedAt && (
                      <p className={styles.meta}>Completed {formatDateLong(goal.completedAt)}</p>
                    )}
                    {goal.notes && <p className={goalStyles.goalNotes}>{goal.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
