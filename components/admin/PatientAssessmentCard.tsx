import styles from "@/app/(admin)/admin.module.css";
import {
  DIMENSIONS,
  getVerdict,
  getInterpretation,
  scoreClass,
  type AssessmentRow,
} from "@/lib/assessment/data";
import { formatDateShort } from "@/lib/utils/format";

export function PatientAssessmentCard({
  assessmentResults,
}: {
  assessmentResults: AssessmentRow[];
}) {
  const result = assessmentResults[0];
  return (
    <div className={styles.card}>
      <p className={styles.cardLabel}>
        Latest Assessment {assessmentResults.length > 1 && `(${assessmentResults.length} total)`}
      </p>
      {!result ? (
        <div className={styles.emptyState}>No assessments yet.</div>
      ) : (
        (() => {
          const scores = result.scores as Record<string, number>;
          const verdict = getVerdict(result.overallScore);
          return (
            <>
              <div className={styles.assessScoreRow}>
                <span className={`${styles.assessScoreBig} ${scoreClass(result.overallScore)}`}>
                  {result.overallScore}
                </span>
                <div>
                  {verdict && <div className={styles.assessVerdictName}>{verdict.name}</div>}
                  <div className={styles.assessDate}>{formatDateShort(result.completedAt)}</div>
                </div>
              </div>
              {verdict && <p className={styles.assessVerdictText}>{verdict.text}</p>}
              <div className={styles.assessDimGrid}>
                {DIMENSIONS.map((dim) => {
                  const score = scores[dim.id] ?? 0;
                  return (
                    <div key={dim.id} className={styles.assessDimCell}>
                      <div className={styles.assessDimIcon}>{dim.icon}</div>
                      <div className={`${styles.assessDimScore} ${scoreClass(score)}`}>{score}</div>
                      <div className={styles.assessDimName}>{dim.name}</div>
                    </div>
                  );
                })}
              </div>
              <div className={styles.assessInterpList}>
                {DIMENSIONS.map((dim) => {
                  const score = scores[dim.id] ?? 0;
                  return (
                    <div key={dim.id} className={styles.assessInterpRow}>
                      <span className={`${styles.assessInterpScore} ${scoreClass(score)}`}>
                        {score}
                      </span>
                      <p className={styles.assessInterpText}>
                        <strong className={styles.assessInterpStrong}>{dim.name}:</strong>{" "}
                        {getInterpretation(dim.id, score)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()
      )}
    </div>
  );
}
