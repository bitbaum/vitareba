/**
 * AI clinical digest — compiles a patient's portal data into a compact,
 * factual text block the model reasons over, plus the two prompt builders
 * (clinician brief / patient insight). No HTTP here; lib/ai does the call.
 */

import { desc, eq, gte, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyCheckins, assessmentResults, clinicalGoals, users } from "@/lib/db/schema";
import { DIMENSIONS, getVerdict } from "@/lib/assessment/data";
import { CHECKIN_METRICS } from "@/lib/config/portal";
import { formatDateISO, DAY_MS } from "@/lib/utils/format";

const DIGEST_CHECKIN_DAYS = 21;

/** Compact factual digest of one patient's data. Empty sections say so. */
export async function compilePatientDigest(patientId: string, now: Date): Promise<string> {
  const since = formatDateISO(new Date(now.getTime() - DIGEST_CHECKIN_DAYS * DAY_MS));

  const [user, checkins, assessments, goals] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, patientId), columns: { name: true } }),
    db.query.dailyCheckins.findMany({
      where: and(eq(dailyCheckins.userId, patientId), gte(dailyCheckins.date, since)),
      orderBy: [desc(dailyCheckins.date)],
    }),
    db.query.assessmentResults.findMany({
      where: eq(assessmentResults.userId, patientId),
      orderBy: [desc(assessmentResults.completedAt)],
      limit: 3,
    }),
    db.query.clinicalGoals.findMany({
      where: and(eq(clinicalGoals.patientId, patientId), isNull(clinicalGoals.completedAt)),
    }),
  ]);

  const lines: string[] = [`Patient: ${user?.name ?? "unnamed"}`];

  if (checkins.length === 0) {
    lines.push(`Check-ins (last ${DIGEST_CHECKIN_DAYS}d): none recorded.`);
  } else {
    lines.push(
      `Check-ins (last ${DIGEST_CHECKIN_DAYS}d, ${checkins.length} entries, 1–5 scale, newest first):`,
    );
    for (const c of checkins) {
      const scores = CHECKIN_METRICS.map((m) => `${m.key}=${c[m.key as keyof typeof c]}`).join(" ");
      lines.push(`  ${c.date}: ${scores}${c.notes ? ` note="${c.notes}"` : ""}`);
    }
  }

  if (assessments.length === 0) {
    lines.push("Inflection Edge assessments: none taken.");
  } else {
    lines.push("Inflection Edge assessments (0–100, newest first):");
    for (const a of assessments) {
      const scores = a.scores as Record<string, number>;
      const dims = DIMENSIONS.map((d) => `${d.name}=${scores[d.id] ?? "?"}`).join(", ");
      lines.push(
        `  ${formatDateISO(a.completedAt)}: overall ${a.overallScore} (${getVerdict(a.overallScore).name}); ${dims}`,
      );
    }
  }

  if (goals.length === 0) {
    lines.push("Active clinical goals: none set.");
  } else {
    lines.push("Active clinical goals:");
    for (const g of goals) {
      lines.push(
        `  "${g.title}" metric=${g.metric ?? "-"} baseline=${g.baseline ?? "-"} current=${g.current ?? "-"} target=${g.target ?? "-"}`,
      );
    }
  }

  return lines.join("\n");
}

export function clinicianBriefPrompt(digest: string): { system: string; user: string } {
  return {
    system:
      "You prepare pre-consultation briefs for a metabolic-psychiatry clinician. " +
      "Be concise, clinical and concrete. Structure: 1) one-line status, 2) notable trends " +
      "with numbers, 3) goal progress, 4) 2–3 suggested discussion points. " +
      "Never diagnose and never suggest medication changes — that is the clinician's job. " +
      "If data is sparse, say exactly what is missing instead of speculating.",
    user: `Prepare the brief from this portal data:\n\n${digest}`,
  };
}

export function patientInsightPrompt(digest: string): { system: string; user: string } {
  return {
    system:
      "You write short, encouraging trend reflections for a patient in a metabolic-psychiatry " +
      "programme, based only on their own tracked data. Warm, plain language, second person. " +
      "Structure: what is moving in the right direction, what to keep an eye on, one gentle " +
      "suggestion for the coming week. No diagnoses, no medical advice, no alarmism. " +
      "If data is sparse, encourage tracking rather than inventing patterns.",
    user: `Write the reflection from this data:\n\n${digest}`,
  };
}

export function differentialPrompt(digest: string): { system: string; user: string } {
  return {
    system:
      "You are an experimental clinical discussion aid for a qualified metabolic-psychiatry " +
      "clinician. From the patient's tracked data, lay out possible patterns worth ruling in or " +
      "out (differential-style), each with the observations supporting and contradicting it, and " +
      "what additional data or test would discriminate. You are NOT a medical device and NOT " +
      "making a diagnosis: frame every item as a hypothesis for the clinician to evaluate, and " +
      "say so plainly when the data is too thin to support any pattern.",
    user: `Discuss differential hypotheses from this portal data:\n\n${digest}`,
  };
}
