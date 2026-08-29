import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { patientScope } from "@/lib/domain/patients";
import {
  users,
  assessmentResults,
  bookings,
  dailyCheckins,
  assessmentLeads,
} from "@/lib/db/schema";
import { eq, desc, gte, isNotNull, count } from "drizzle-orm";
import styles from "../../admin.module.css";
import { computePatientSignal } from "@/lib/domain/signals";
import {
  SIGNAL_LABELS,
  SIGNAL_COLORS,
  SIGNAL_SORT_ORDER,
  SIGNAL_CHECKIN_WINDOW_DAYS,
  type PatientSignal,
} from "@/lib/config/admin";
import { USER_ROLE } from "@/lib/config/auth";
import { PORTAL_ROUTES, ADMIN_ROUTES } from "@/lib/config/routes";
import {
  PROGRAMME_CONFIG,
  PHASE_CONFIG,
  type ProgrammeKey,
  type PhaseKey,
} from "@/lib/config/programmes";
import { VERDICT_TIERS, getVerdictName, scoreClass } from "@/lib/assessment/data";
import {
  formatDateShort,
  formatDateISO,
  formatDateMonthDay,
  displayName,
} from "@/lib/utils/format";
import { CHECKIN_METRICS, CHECKIN_DISPLAY_DAYS, type MetricKey } from "@/lib/config/portal";
import { CheckinTrendChart } from "@/components/portal/CheckinTrendChart";
import Link from "next/link";

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className={`${styles.card} ${styles.statCardPadded}`}>
      <p className={styles.statCardLabel}>{label}</p>
      <p className={sub ? styles.statCardValueWithSub : styles.statCardValueNoSub}>{value}</p>
      {sub && <p className={styles.statCardSub}>{sub}</p>}
    </div>
  );
}

export default async function ReportsPage() {
  const session = await auth();
  if (!session || session.user.role !== USER_ROLE.admin) redirect(PORTAL_ROUTES.dashboard);

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - SIGNAL_CHECKIN_WINDOW_DAYS);
  const weekAgoStr = formatDateISO(weekAgo);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - CHECKIN_DISPLAY_DAYS);
  const thirtyDaysAgoStr = formatDateISO(thirtyDaysAgo);

  // All queries are independent — run in parallel to minimise page latency
  const [
    patients,
    allAssessments,
    recentCheckins,
    populationCheckins,
    [totalLeads, convertedLeads],
    assignments,
  ] = await Promise.all([
    // All patients with signal-relevant data
    db.query.users.findMany({
      where: patientScope(),
      with: {
        assessmentResults: {
          orderBy: [desc(assessmentResults.completedAt)],
          limit: 2,
        },
        bookings: {
          orderBy: [desc(bookings.createdAt)],
          limit: 1,
        },
        dailyCheckins: {
          orderBy: [desc(dailyCheckins.date)],
          limit: SIGNAL_CHECKIN_WINDOW_DAYS,
        },
      },
    }),
    // Assessment stats with patient name join
    db
      .select({
        id: assessmentResults.id,
        overallScore: assessmentResults.overallScore,
        completedAt: assessmentResults.completedAt,
        userId: assessmentResults.userId,
        userName: users.name,
        userEmail: users.email,
      })
      .from(assessmentResults)
      .leftJoin(users, eq(assessmentResults.userId, users.id))
      .orderBy(desc(assessmentResults.completedAt)),
    // Check-in counts for the current adherence window
    db.query.dailyCheckins.findMany({
      where: gte(dailyCheckins.date, weekAgoStr),
      columns: { userId: true, date: true },
    }),
    // Population wellness trend for the last 30 days
    db.query.dailyCheckins.findMany({
      where: gte(dailyCheckins.date, thirtyDaysAgoStr),
      columns: { date: true, sleep: true, energy: true, mood: true, focus: true, stress: true },
      orderBy: [desc(dailyCheckins.date)],
    }),
    // Inflection Edge conversion funnel
    Promise.all([
      db
        .select({ value: count() })
        .from(assessmentLeads)
        .then((r) => r[0]?.value ?? 0),
      db
        .select({ value: count() })
        .from(assessmentLeads)
        .where(isNotNull(assessmentLeads.convertedUserId))
        .then((r) => r[0]?.value ?? 0),
    ]),
    // Programme assignments
    db.query.programmeAssignments.findMany(),
  ]);

  // Signal distribution + per-patient adherence (single pass over patients)
  const signalCounts: Record<PatientSignal, number> = {
    critical: 0,
    attention: 0,
    active: 0,
    new: 0,
  };
  const patientAdherence = patients.map((p) => {
    const { signal, reason } = computePatientSignal({
      registeredAt: p.createdAt,
      checkins: p.dailyCheckins,
      assessments: p.assessmentResults.map((a) => ({
        overallScore: a.overallScore,
        completedAt: a.completedAt,
      })),
      bookings: p.bookings,
      now,
    });
    signalCounts[signal]++;
    const weekCheckins = p.dailyCheckins.filter((c) => c.date >= weekAgoStr).length;
    return { id: p.id, name: p.name ?? p.email ?? "Unknown", weekCheckins, signal, reason };
  });
  // Sort: fewest check-ins first so the patients needing attention are at top
  patientAdherence.sort((a, b) => a.weekCheckins - b.weekCheckins || a.name.localeCompare(b.name));

  // Assessment averages and tier distribution
  const avgScore =
    allAssessments.length > 0
      ? Math.round(allAssessments.reduce((s, a) => s + a.overallScore, 0) / allAssessments.length)
      : null;
  const tierCounts = VERDICT_TIERS.map((tier) => ({
    name: tier.name,
    count: allAssessments.filter(
      (a) => a.overallScore >= tier.minScore && a.overallScore <= tier.maxScore,
    ).length,
    color: tier.color,
  }));

  // Check-in adherence stats
  const todayStr = formatDateISO(now);
  const uniqueActiveUsers = new Set(recentCheckins.map((c) => c.userId)).size;
  const todayCheckinCount = recentCheckins.filter((c) => c.date === todayStr).length;

  // Population wellness trend — group by date and compute per-metric averages
  const byDate = new Map<string, { sums: Record<MetricKey, number>; count: number }>();
  for (const c of populationCheckins) {
    const entry = byDate.get(c.date) ?? {
      sums: { sleep: 0, energy: 0, mood: 0, focus: 0, stress: 0 },
      count: 0,
    };
    for (const { key } of CHECKIN_METRICS) {
      entry.sums[key] += c[key];
    }
    entry.count++;
    byDate.set(c.date, entry);
  }
  const populationTrend = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sums, count }]) => ({
      date: formatDateMonthDay(date + "T00:00:00"),
      ...(Object.fromEntries(
        CHECKIN_METRICS.map(({ key }) => [key, Math.round((sums[key] / count) * 10) / 10]),
      ) as Record<MetricKey, number>),
    }));

  // Conversion funnel rate
  const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : null;

  // Programme distribution
  const programmeCounts: Partial<Record<ProgrammeKey, number>> = {};
  const phaseCounts: Partial<Record<PhaseKey, number>> = {};
  for (const a of assignments) {
    programmeCounts[a.programme] = (programmeCounts[a.programme] ?? 0) + 1;
    phaseCounts[a.phase] = (phaseCounts[a.phase] ?? 0) + 1;
  }

  const SIGNAL_ORDER = (Object.keys(SIGNAL_SORT_ORDER) as PatientSignal[]).sort(
    (a, b) => SIGNAL_SORT_ORDER[a] - SIGNAL_SORT_ORDER[b],
  );

  return (
    <div>
      <h1 className={styles.pageTitle}>
        <em>Reports</em>
      </h1>
      <p className={styles.pageSub}>Live snapshot — updates on every page load</p>

      {/* ── Top-level stats ──────────────────────────────────────────────── */}
      <div className={styles.statsGrid}>
        <StatCard label="Total patients" value={patients.length} />
        <StatCard
          label="Checked in today"
          value={`${todayCheckinCount} / ${patients.length}`}
          sub={`${recentCheckins.length} total this week · ${uniqueActiveUsers} patient${uniqueActiveUsers !== 1 ? "s" : ""} active`}
        />
        <StatCard
          label="Assessments taken"
          value={allAssessments.length}
          sub={avgScore !== null ? `avg score ${avgScore}/100` : "no data yet"}
        />
        <StatCard
          label="Programmes assigned"
          value={assignments.length}
          sub={`${patients.length - assignments.length} unassigned`}
        />
      </div>

      {/* ── Inflection Edge conversion funnel ────────────────────────────── */}
      {totalLeads > 0 && (
        <div className={`${styles.card} ${styles.adherenceSection}`}>
          <p className={styles.sectionLabel}>Inflection Edge conversion funnel</p>
          <div className={styles.statsGrid}>
            <StatCard
              label="Overlay completions"
              value={totalLeads}
              sub="anonymous visitors who finished"
            />
            <StatCard
              label="Converted to patient"
              value={convertedLeads}
              sub={conversionRate !== null ? `${conversionRate}% conversion rate` : undefined}
            />
            <StatCard
              label="Registered (total)"
              value={patients.length}
              sub="includes direct registrations"
            />
          </div>
        </div>
      )}

      <div className={styles.twoColGrid}>
        {/* ── Signal breakdown ─────────────────────────────────────────── */}
        <div className={styles.card}>
          <p className={styles.sectionLabel}>Patient signals</p>
          <div className={styles.barRow}>
            {SIGNAL_ORDER.map((signal) => {
              const count = signalCounts[signal];
              const pct = patients.length > 0 ? Math.round((count / patients.length) * 100) : 0;
              return (
                <div key={signal}>
                  <div className={styles.barRowItem}>
                    <span className={styles.signalBadge} data-signal={signal}>
                      {SIGNAL_LABELS[signal]}
                    </span>
                    <span className={styles.barCount}>
                      {count} <span className={styles.barPct}>({pct}%)</span>
                    </span>
                  </div>
                  <div className={styles.barTrack}>
                    <div
                      className={styles.barFill}
                      style={{
                        width: `${pct}%`,
                        background: SIGNAL_COLORS[signal as PatientSignal],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Assessment score distribution ────────────────────────────── */}
        <div className={styles.card}>
          <p className={styles.sectionLabel}>Assessment score tiers</p>
          {allAssessments.length === 0 ? (
            <div className={styles.emptyStateInline}>No assessments yet.</div>
          ) : (
            <div className={styles.barRow}>
              {tierCounts.map((tier) => {
                const pct =
                  allAssessments.length > 0
                    ? Math.round((tier.count / allAssessments.length) * 100)
                    : 0;
                return (
                  <div key={tier.name}>
                    <div className={styles.barRowItem}>
                      <span className={styles.tierName}>{tier.name}</span>
                      <span className={styles.tierCount}>
                        {tier.count} ({pct}%)
                      </span>
                    </div>
                    <div className={styles.barTrack}>
                      <div
                        className={styles.barFill}
                        style={{ width: `${pct}%`, background: tier.color }}
                      />
                    </div>
                  </div>
                );
              })}
              {avgScore !== null && (
                <p className={styles.avgNote}>
                  Population average:{" "}
                  <strong className={scoreClass(avgScore)}>{avgScore}/100</strong> —{" "}
                  {getVerdictName(avgScore)}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Programme distribution ───────────────────────────────────── */}
        <div className={styles.card}>
          <p className={styles.sectionLabel}>Programme distribution</p>
          {assignments.length === 0 ? (
            <div className={styles.emptyStateInline}>No assignments yet.</div>
          ) : (
            <>
              <table className={`${styles.table} ${styles.tableWithMargin}`}>
                <tbody>
                  {Object.entries(programmeCounts).map(([key, count]) => (
                    <tr key={key}>
                      <td className={styles.tableCellName}>
                        {PROGRAMME_CONFIG[key as ProgrammeKey]?.label ?? key}
                      </td>
                      <td className={styles.tableCellCount}>
                        {count} patient{count !== 1 ? "s" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={styles.phaseLabel}>By phase</p>
              <table className={styles.table}>
                <tbody>
                  {Object.entries(phaseCounts).map(([key, count]) => (
                    <tr key={key}>
                      <td className={styles.tableCellName}>
                        {PHASE_CONFIG[key as PhaseKey]?.label ?? key}
                      </td>
                      <td className={styles.tableCellCount}>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* ── Recent assessments ───────────────────────────────────────── */}
        <div className={styles.card}>
          <p className={styles.sectionLabel}>Recent assessments (last 10)</p>
          {allAssessments.length === 0 ? (
            <div className={styles.emptyStateInline}>No assessments yet.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Score</th>
                  <th>Tier</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {allAssessments.slice(0, 10).map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link
                        href={`${ADMIN_ROUTES.patients}/${a.userId}`}
                        className={styles.adherenceLink}
                      >
                        {displayName(a.userName, a.userEmail)}
                      </Link>
                    </td>
                    <td>
                      <span className={`${styles.scoreChipLarge} ${scoreClass(a.overallScore)}`}>
                        {a.overallScore}
                      </span>
                    </td>
                    <td className={styles.tableTierCell}>{getVerdictName(a.overallScore)}</td>
                    <td className={styles.tableDateCell}>{formatDateShort(a.completedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Population wellness trend ────────────────────────────────────── */}
      {populationTrend.length > 1 && (
        <div className={`${styles.card} ${styles.adherenceSection}`}>
          <p className={styles.sectionLabel}>
            Population wellness trend — last 30 days (avg across all patients)
          </p>
          <CheckinTrendChart data={populationTrend} />
        </div>
      )}

      {/* ── Per-patient check-in adherence ───────────────────────────────── */}
      {patients.length > 0 && (
        <div className={`${styles.card} ${styles.adherenceSection}`}>
          <p className={styles.sectionLabel}>
            Check-in adherence — last {SIGNAL_CHECKIN_WINDOW_DAYS} days
          </p>
          <table className={styles.adherenceTable}>
            <thead>
              <tr>
                <th className={styles.adherenceTh}>Patient</th>
                <th className={styles.adherenceTh}>Signal</th>
                <th className={`${styles.adherenceTh} ${styles.adherenceThRight}`}>Days</th>
                <th className={styles.adherenceTh}>Progress</th>
              </tr>
            </thead>
            <tbody>
              {patientAdherence.map(({ id, name, weekCheckins, signal }) => {
                const pct = Math.round((weekCheckins / SIGNAL_CHECKIN_WINDOW_DAYS) * 100);
                const barColor =
                  weekCheckins === 0
                    ? "var(--danger)"
                    : weekCheckins < 4
                      ? "var(--warn)"
                      : "var(--teal)";
                return (
                  <tr key={id} className={styles.adherenceRow}>
                    <td className={styles.adherenceName}>
                      <Link
                        href={`${ADMIN_ROUTES.patients}/${id}`}
                        className={styles.adherenceLink}
                      >
                        {name}
                      </Link>
                    </td>
                    <td className={styles.adherenceSignalCell}>
                      <span className={styles.signalBadge} data-signal={signal}>
                        {SIGNAL_LABELS[signal]}
                      </span>
                    </td>
                    <td className={styles.adherenceCount}>
                      {weekCheckins}/{SIGNAL_CHECKIN_WINDOW_DAYS}
                    </td>
                    <td className={styles.adherenceBarCell}>
                      <div className={styles.barTrack}>
                        <div
                          className={styles.barFill}
                          style={{ width: `${pct}%`, background: barColor }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
