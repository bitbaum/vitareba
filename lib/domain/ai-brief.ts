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
    lines.push(`Check-ins (last ${DIGEST_CHECKIN_DAYS}d, ${checkins.length} entries, 1–5 scale, newest first):`);
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
        `  ${formatDateISO(a.completedAt)}: overall ${a.overallScore} (${getVerdict(a.overallScore).name}); ${dims}`
      );
    }
  }

  if (goals.length === 0) {
    lines.push("Active clinical goals: none set.");
  } else {
    lines.push("Active clinical goals:");
    for (const g of goals) {
      lines.push(
        `  "${g.title}" metric=${g.metric ?? "-"} baseline=${g.baseline ?? "-"} current=${g.current ?? "-"} target=${g.target ?? "-"}`
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

/**
 * The post-check-in companion — a CONVERSATION, not a one-shot reflection, so
 * the turns come from the client and only the system prompt is built here.
 *
 * Three rules earn their place. It answers from the digest and cites the
 * number, because a companion that invents a trend is worse than no companion
 * in a clinical product. It may propose behavioural experiments the patient
 * can measure in their own next check-ins, but never anything that belongs to
 * a prescription pad. And everything it cannot settle goes to the named human
 * who supervises it — `clinicianLabel` is resolved from care_team by the
 * caller, never a name from config.
 */
export function checkinCompanionSystem(digest: string, clinicianLabel: string): string {
  return [
    "You are a reflective companion for a patient in a metabolic-psychiatry programme, " +
      "talking with them right after their daily check-in. Warm, plain language, second person, " +
      "2–5 sentences per reply. Ask a short follow-up question when it would help them think.",

    "Answer ONLY from the tracked data below, and quote the number you are reasoning from " +
      '("your focus averaged 2.4 on the three nights you slept worst"). Never invent a number, ' +
      "a trend or an event. If the data cannot answer the question, say exactly that.",

    "When they ask what to do, offer at most two concrete things to TRY for the coming week. " +
      "Each one must (a) name the observation in their data that prompted it, (b) be a behavioural " +
      "experiment they can run and measure in their next check-ins — sleep and wake timing, light " +
      "exposure, movement, caffeine and meal timing, workload structure — and (c) be framed as " +
      `something to review with ${clinicianLabel}. Say plainly when the evidence for a suggestion ` +
      "is general rather than something their own data shows.",

    "Out of scope, always: diagnosing, naming conditions, reading symptoms as a disorder, and any " +
      "advice about medication, dosage or supplements — including stopping or starting anything. " +
      `Those are ${clinicianLabel}'s decisions, made with the same data you are reading. Hand them ` +
      "over rather than hedging around them.",

    `If the patient describes something acute or distressing, say so kindly, keep it short, and ` +
      `point them to ${clinicianLabel} — they can book a consultation or send a message from this ` +
      "page. For an emergency, tell them to contact local emergency services.",

    `The patient's tracked data:\n\n${digest}`,
  ].join("\n\n");
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
