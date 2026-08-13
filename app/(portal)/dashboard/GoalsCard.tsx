import Link from "next/link";
import shared from "../portal.module.css";
import styles from "./dashboard.module.css";
import { type GoalRow } from "@/lib/config/portal";
import { PORTAL_ROUTES } from "@/lib/config/routes";
import { computeGoalProgress, goalProgressLabel } from "@/lib/domain/goals";

export function GoalsCard({ goals }: { goals: Pick<GoalRow, "id" | "title" | "baseline" | "current" | "target">[] }) {
  if (goals.length === 0) return null;

  return (
    <div className={shared.card}>
      <div className={styles.goalsCardHeader}>
        <p className={shared.cardTitleFlush}>Your goals</p>
        <Link href={PORTAL_ROUTES.goals} className={styles.goalsViewAll}>View all</Link>
      </div>
      <div className={styles.goalsList}>
        {goals.map((goal) => {
          const hasProgress = goal.baseline != null || goal.current != null || goal.target != null;
          const currentPct = computeGoalProgress(goal.baseline, goal.current, goal.target);
          return (
            <div key={goal.id}>
              <p className={styles.goalTitle}>{goal.title}</p>
              {hasProgress && (
                <>
                  <div className={shared.progressTrack}>
                    <div
                      className={shared.progressFill}
                      style={{ width: `${currentPct ?? 0}%` }}
                    />
                  </div>
                  <p className={styles.goalProgressMeta}>
                    {currentPct != null
                      ? goalProgressLabel(currentPct)
                      : goal.current != null
                      ? `Current: ${goal.current}${goal.target != null ? ` · Target: ${goal.target}` : ""}`
                      : null}
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
