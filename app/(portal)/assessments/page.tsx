import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assessmentResults } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { DIMENSIONS, getInterpretation, scoreClass } from "@/lib/assessment/data";
import { ASSESSMENT_STALE_DAYS } from "@/lib/config/portal";
import { PORTAL_ROUTES } from "@/lib/config/routes";
import { formatDateLong, formatDateMonthDay, sentenceCase } from "@/lib/utils/format";
import { clinicianLabelFor } from "@/lib/domain/clinician-label";
import styles from "../portal.module.css";
import assessStyles from "./assessments.module.css";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";
import { AssessmentTrendChartWrapper } from "./AssessmentTrendChartWrapper";

export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const session = await auth();
  if (!session) return null;

  const [params, results, clinician] = await Promise.all([
    searchParams,
    db.query.assessmentResults.findMany({
      where: eq(assessmentResults.userId, session.user.id),
      orderBy: [desc(assessmentResults.completedAt)],
    }),
    clinicianLabelFor(session.user.id),
  ]);

  const justSaved = params.saved === "1";

  // Build chart data (ascending for chart rendering)
  const chartData = [...results].reverse().map((r) => ({
    date: formatDateMonthDay(r.completedAt),
    score: r.overallScore,
  }));

  return (
    <div>
      <PortalPageHeader
        title={
          <>
            My <em>Results</em>
          </>
        }
        subtitle="Your Inflection Edge assessment history"
      />

      {/* Trend chart — only shown when there are 2+ assessments */}
      {results.length >= 2 && (
        <div className={styles.cardMb}>
          <p className={styles.cardTitle}>Score trend</p>
          <AssessmentTrendChartWrapper data={chartData} />
        </div>
      )}
      {results.length === 1 && (
        <p className={assessStyles.trendHint}>
          Complete a second assessment to unlock your score trend chart.
        </p>
      )}

      {justSaved && (
        <div className={assessStyles.savedBanner}>
          <div>
            <p className={assessStyles.savedEyebrow}>Results saved</p>
            <p className={assessStyles.savedTitle}>
              Your Inflection Edge profile is now on record.
            </p>
          </div>
          <p className={assessStyles.savedBody}>
            This is your baseline. Every check-in, every retake builds on it — showing you exactly
            how your biology and performance evolve over time. {sentenceCase(clinician)} reviews
            this data before every consultation to design your programme around your actual profile,
            not a generic template.
          </p>
          <p className={assessStyles.savedBody}>
            The single highest-leverage next step: a 30-minute discovery call with {clinician} to
            translate your scores into a concrete plan.
          </p>
          <div className={assessStyles.savedActions}>
            <Link href={PORTAL_ROUTES.bookings} className="btn-dark">
              Book a discovery call →
            </Link>
            <Link href={PORTAL_ROUTES.dashboard} className={assessStyles.savedSecondary}>
              Back to dashboard
            </Link>
          </div>
        </div>
      )}

      {results.length === 0 ? (
        <div className={styles.card}>
          <div className={styles.emptyState}>
            <p>No assessments yet.</p>
            <Link href={PORTAL_ROUTES.assessment} className={assessStyles.emptyLink}>
              Take the Inflection Edge →
            </Link>
          </div>
        </div>
      ) : (
        <div className={styles.listStack}>
          {results.map((result, i) => {
            const scores = result.scores as Record<string, number>;
            return (
              <div key={result.id} className={styles.card}>
                <div className={assessStyles.resultHeader}>
                  <div>
                    <p className={styles.cardTitle}>
                      {i === 0 ? "Latest assessment" : `Assessment ${results.length - i}`}
                    </p>
                    <p className={styles.meta}>{formatDateLong(result.completedAt)}</p>
                  </div>
                  <div className={assessStyles.overallBlock}>
                    <span
                      className={`${styles.statValue} ${styles.statXl} ${scoreClass(result.overallScore)}`}
                    >
                      {result.overallScore}
                    </span>
                    <p className={assessStyles.overallLabel}>overall</p>
                  </div>
                </div>

                <div className={assessStyles.dimGrid}>
                  {DIMENSIONS.map((dim) => {
                    const score = scores[dim.id] ?? 0;
                    return (
                      <div key={dim.id} className={assessStyles.dimCell}>
                        <div className={assessStyles.dimIcon}>{dim.icon}</div>
                        <div
                          className={`${styles.statValue} ${styles.statMd} ${scoreClass(score)}`}
                        >
                          {score}
                        </div>
                        <div className={assessStyles.dimName}>{dim.name}</div>
                        <div className={assessStyles.dimBar}>
                          <div
                            className={`${assessStyles.dimBarFill} ${scoreClass(score)}`}
                            style={{ width: `${score}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className={assessStyles.interpretations}>
                  {DIMENSIONS.map((dim) => {
                    const score = scores[dim.id] ?? 0;
                    const interpretation = getInterpretation(dim.id, score);
                    return (
                      <div key={dim.id} className={assessStyles.interpRow}>
                        <div className={assessStyles.interpMeta}>
                          <span
                            className={`${styles.statValue} ${styles.statSm} ${scoreClass(score)}`}
                          >
                            {score}
                          </span>
                          <span className={assessStyles.interpDimName}>{dim.name}</span>
                        </div>
                        <p className={assessStyles.interpText}>{interpretation}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className={assessStyles.retakeCta}>
        <p className={assessStyles.retakeHint}>
          Retake every {ASSESSMENT_STALE_DAYS} days to see how your profile shifts with your
          programme.
        </p>
        <Link href={PORTAL_ROUTES.assessment} className={`btn-outline ${assessStyles.retakeBtn}`}>
          Retake assessment →
        </Link>
      </div>
    </div>
  );
}
