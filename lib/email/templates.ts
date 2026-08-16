// ─── Shared layout ────────────────────────────────────────────────────────────

import { PORTAL_URL, COMPANY } from "@/lib/config/company";
import { PORTAL_ROUTES } from "@/lib/config/routes";
import { type MetricKey, CHECKIN_STREAK_MILESTONES } from "@/lib/config/portal";
import { PASSWORD_RESET_TOKEN_EXPIRY_MS } from "@/lib/config/auth";
import { streakMessage } from "@/lib/domain/checkin";
import { sentenceCase } from "@/lib/utils/format";
import {
  COLOR_INK, COLOR_INK2, COLOR_MUTED, COLOR_TEAL, COLOR_GOLD,
  COLOR_OFF, COLOR_LIGHT, COLOR_BORDER, COLOR_WARN, COLOR_DANGER, COLOR_WHITE,
} from "@/lib/config/theme";

/** Escapes HTML special characters to prevent injection in email templates. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Returns a hex color for a 1–5 check-in metric. inverted=true for stress (high = bad). */
function metricColor(val: number, inverted = false): string {
  const bad = inverted ? val >= 4 : val <= 2;
  if (bad) return COLOR_DANGER;
  if (val === 3) return COLOR_WARN;
  return COLOR_TEAL;
}

function layout(body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body { margin: 0; padding: 0; background: ${COLOR_OFF}; font-family: 'DM Sans', Arial, sans-serif; color: ${COLOR_INK}; }
  .wrap { max-width: 560px; margin: 40px auto; background: ${COLOR_WHITE}; border-radius: 8px; border: 1px solid ${COLOR_BORDER}; overflow: hidden; }
  .header { background: ${COLOR_INK}; padding: 28px 32px; }
  .header h1 { margin: 0; font-size: 18px; font-weight: 400; letter-spacing: 0.12em; color: ${COLOR_WHITE}; text-transform: uppercase; }
  .header span { color: ${COLOR_TEAL}; }
  .body { padding: 32px; }
  .body p { margin: 0 0 16px; line-height: 1.6; font-size: 15px; color: ${COLOR_INK2}; }
  .body p:last-child { margin-bottom: 0; }
  .btn { display: inline-block; margin: 8px 0; padding: 12px 24px; background: ${COLOR_TEAL}; color: ${COLOR_WHITE} !important; text-decoration: none; border-radius: 4px; font-size: 14px; letter-spacing: 0.08em; }
  .divider { height: 1px; background: ${COLOR_BORDER}; margin: 24px 0; }
  .meta { font-size: 13px; color: ${COLOR_MUTED}; }
  .footer { padding: 20px 32px; border-top: 1px solid ${COLOR_BORDER}; font-size: 12px; color: ${COLOR_MUTED}; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header"><h1>Vita<span>Re</span>Ba</h1></div>
  <div class="body">${body}</div>
  <div class="footer">${COMPANY.name} · ${COMPANY.address.city} · <a href="${PORTAL_URL}" style="color:${COLOR_TEAL}">${PORTAL_URL.replace(/^https?:\/\//, "")}</a></div>
</div>
</body>
</html>`;
}

// ─── Booking: notification to admin ───────────────────────────────────────────

export function bookingRequestAdminEmail({
  patientName,
  patientEmail,
  bookingTypeLabel,
  machineTypeLabel,
  notes,
  preferredDate,
  adminUrl,
}: {
  patientName: string;
  patientEmail: string;
  bookingTypeLabel: string;
  machineTypeLabel?: string | null;
  notes?: string | null;
  preferredDate?: string | null;
  adminUrl: string;
}) {
  patientName = escapeHtml(patientName);
  patientEmail = escapeHtml(patientEmail);
  const escapedNotes = notes ? escapeHtml(notes) : null;

  return layout(`
    <p>A new booking request has been submitted.</p>
    <div class="divider"></div>
    <p class="meta"><strong>Patient:</strong> ${patientName} (${patientEmail})</p>
    <p class="meta"><strong>Type:</strong> ${bookingTypeLabel}${machineTypeLabel ? ` — ${machineTypeLabel}` : ""}</p>
    ${preferredDate ? `<p class="meta"><strong>Preferred date:</strong> ${preferredDate}</p>` : ""}
    ${escapedNotes ? `<p class="meta"><strong>Notes:</strong> ${escapedNotes}</p>` : ""}
    <div class="divider"></div>
    <p><a class="btn" href="${adminUrl}">Review in Admin Portal</a></p>
  `);
}

// ─── Booking: confirmation to patient ─────────────────────────────────────────

export function bookingConfirmedEmail({
  patientName,
  sessionLabel,
  portalUrl,
}: {
  patientName: string;
  sessionLabel: string;
  portalUrl: string;
}) {
  patientName = escapeHtml(patientName);
  sessionLabel = escapeHtml(sessionLabel);

  return layout(`
    <p>Hi ${patientName},</p>
    <p>Your <strong>${sessionLabel}</strong> request has been <strong>confirmed</strong>. We will be in touch shortly with the details.</p>
    <p>In the meantime, you can view all your bookings in your patient portal.</p>
    <p><a class="btn" href="${portalUrl}">View your bookings</a></p>
  `);
}

// ─── Booking: cancellation to patient ─────────────────────────────────────────

export function bookingCancelledEmail({
  patientName,
  sessionLabel,
  portalUrl,
}: {
  patientName: string;
  sessionLabel: string;
  portalUrl: string;
}) {
  patientName = escapeHtml(patientName);
  sessionLabel = escapeHtml(sessionLabel);

  return layout(`
    <p>Hi ${patientName},</p>
    <p>Your <strong>${sessionLabel}</strong> request has been cancelled. If you have any questions, please reply to this email or send us a message through the portal.</p>
    <p><a class="btn" href="${portalUrl}">Open patient portal</a></p>
  `);
}

// ─── Booking: patient self-cancellation to admin ──────────────────────────────

export function bookingCancelledAdminEmail({
  patientName,
  patientEmail,
  bookingTypeLabel,
  machineTypeLabel,
  adminUrl,
}: {
  patientName: string;
  patientEmail: string;
  bookingTypeLabel: string;
  machineTypeLabel?: string | null;
  adminUrl: string;
}) {
  patientName = escapeHtml(patientName);
  patientEmail = escapeHtml(patientEmail);

  return layout(`
    <p>A patient has cancelled their pending booking request.</p>
    <div class="divider"></div>
    <p class="meta"><strong>Patient:</strong> ${patientName} (${patientEmail})</p>
    <p class="meta"><strong>Type:</strong> ${bookingTypeLabel}${machineTypeLabel ? ` — ${machineTypeLabel}` : ""}</p>
    <div class="divider"></div>
    <p><a class="btn" href="${adminUrl}">View patient →</a></p>
  `);
}

// ─── Booking: moved to a new time ─────────────────────────────────────────────

export function bookingRescheduledEmail({
  patientName,
  sessionLabel,
  fromLabel,
  toLabel,
  portalUrl,
}: {
  patientName: string;
  sessionLabel: string;
  fromLabel: string;
  toLabel: string;
  portalUrl: string;
}) {
  patientName = escapeHtml(patientName);
  sessionLabel = escapeHtml(sessionLabel);
  fromLabel = escapeHtml(fromLabel);
  toLabel = escapeHtml(toLabel);

  return layout(`
    <p>Hi ${patientName},</p>
    <p>Your <strong>${sessionLabel}</strong> has been moved.</p>
    <div class="divider"></div>
    <p class="meta"><strong>Was:</strong> ${fromLabel}</p>
    <p class="meta"><strong>Now:</strong> ${toLabel}</p>
    <div class="divider"></div>
    <p>The calendar invite attached to this email replaces the old one — opening it will update the entry rather than add a second.</p>
    <p><a class="btn" href="${portalUrl}">View your bookings</a></p>
  `);
}

// ─── Booking: cancelled appointment, with the policy stated ──────────────────

export function bookingAppointmentCancelledEmail({
  patientName,
  sessionLabel,
  whenLabel,
  late,
  policyDetail,
  portalUrl,
}: {
  patientName: string;
  sessionLabel: string;
  whenLabel: string;
  late: boolean;
  policyDetail: string;
  portalUrl: string;
}) {
  patientName = escapeHtml(patientName);
  sessionLabel = escapeHtml(sessionLabel);
  whenLabel = escapeHtml(whenLabel);
  policyDetail = escapeHtml(policyDetail);

  return layout(`
    <p>Hi ${patientName},</p>
    <p>Your <strong>${sessionLabel}</strong> on ${whenLabel} has been cancelled, and the slot is free again.</p>
    ${
      late
        ? `<div class="divider"></div><p class="meta">This was a late cancellation. There is no charge — it is recorded so your clinician has the full picture.</p>`
        : ""
    }
    <div class="divider"></div>
    <p class="meta">${policyDetail}</p>
    <p><a class="btn" href="${portalUrl}">Book another time</a></p>
  `);
}

// ─── Booking: appointment change, to the clinician ───────────────────────────

export function bookingChangedClinicianEmail({
  patientName,
  patientEmail,
  headline,
  detailLines,
  adminUrl,
}: {
  patientName: string;
  patientEmail: string;
  headline: string;
  detailLines: string[];
  adminUrl: string;
}) {
  patientName = escapeHtml(patientName);
  patientEmail = escapeHtml(patientEmail);
  headline = escapeHtml(headline);

  return layout(`
    <p>${headline}</p>
    <div class="divider"></div>
    <p class="meta"><strong>Patient:</strong> ${patientName} (${patientEmail})</p>
    ${detailLines.map((l) => `<p class="meta">${escapeHtml(l)}</p>`).join("")}
    <div class="divider"></div>
    <p><a class="btn" href="${adminUrl}">View patient →</a></p>
  `);
}

// ─── Password reset ────────────────────────────────────────────────────────────

export function passwordResetEmail({
  resetUrl,
}: {
  resetUrl: string;
}) {
  return layout(`
    <p>You requested a password reset for your ${COMPANY.shortName} account.</p>
    <p>Click the button below to set a new password. This link expires in <strong>${PASSWORD_RESET_TOKEN_EXPIRY_MS / 3_600_000} ${PASSWORD_RESET_TOKEN_EXPIRY_MS / 3_600_000 === 1 ? "hour" : "hours"}</strong>.</p>
    <p><a class="btn" href="${resetUrl}">Reset password</a></p>
    <div class="divider"></div>
    <p class="meta">If you did not request this, you can safely ignore this email.</p>
  `);
}

// ─── New message notification ─────────────────────────────────────────────────

export function newMessageEmail({
  recipientName,
  senderName,
  subject,
  portalUrl,
}: {
  recipientName: string;
  senderName: string;
  subject: string;
  portalUrl: string;
}) {
  recipientName = escapeHtml(recipientName);
  senderName = escapeHtml(senderName);
  subject = escapeHtml(subject);

  return layout(`
    <p>Hi ${recipientName},</p>
    <p>You have a new message from <strong>${senderName}</strong> regarding: <em>${subject}</em></p>
    <p><a class="btn" href="${portalUrl}">Read message</a></p>
  `);
}

// ─── Welcome sequence: immediate welcome ─────────────────────────────────────

export function welcomePatientEmail({
  patientName,
  portalUrl,
  clinician = COMPANY.clinicianFallback,
}: {
  patientName: string;
  portalUrl: string;
  clinician?: string;
}) {
  patientName = escapeHtml(patientName);
  clinician = escapeHtml(clinician);

  return layout(`
    <p>Hi ${patientName},</p>
    <p>Welcome to ${COMPANY.shortName}. Your patient portal is ready.</p>
    <p>${sentenceCase(clinician)} works with a small number of patients at a time — which means your programme will be built around your specific biology, not a template. To make that possible, ${clinician} needs your data.</p>
    <div class="divider"></div>
    <p><strong>Here is what to do first:</strong></p>
    <p>1. <strong>Complete your profile</strong> — your clinical history, current medications, and lifestyle baseline give ${clinician} the context needed before your first consultation.</p>
    <p>2. <strong>Take the Inflection Edge</strong> — 30 questions, 5 minutes. Your results map your ADHD profile across five dimensions and unlock ${clinician}'s ability to personalise your protocol.</p>
    <p>3. <strong>Check in daily</strong> — takes 30 seconds. Sleep, energy, mood, focus, stress. Over time this becomes your most valuable clinical dataset.</p>
    <div class="divider"></div>
    <p><a class="btn" href="${portalUrl}${PORTAL_ROUTES.dashboard}">Open your portal</a></p>
    <p class="meta">If you have any questions before your first consultation, reply to this email.</p>
  `);
}

// ─── Welcome sequence: profile completion nudge (+24h) ───────────────────────

export function profileCompletionEmail({
  patientName,
  portalUrl,
  clinician = COMPANY.clinicianFallback,
}: {
  patientName: string;
  portalUrl: string;
  clinician?: string;
}) {
  patientName = escapeHtml(patientName);
  clinician = escapeHtml(clinician);

  return layout(`
    <p>Hi ${patientName},</p>
    <p>One quick thing before your first consultation: your profile.</p>
    <p>${sentenceCase(clinician)} reviews every patient's profile before meeting them. Your clinical history, current medications, and lifestyle baseline allow for your first session to already be built around your situation — not spending the first 20 minutes gathering basics.</p>
    <p>It takes about 5 minutes and makes a measurable difference to the quality of your first consultation.</p>
    <p><a class="btn" href="${portalUrl}${PORTAL_ROUTES.profile}">Complete your profile</a></p>
    <p class="meta">Already done? Ignore this email.</p>
  `);
}

// ─── Welcome sequence: assessment CTA (+72h) ─────────────────────────────────

export function assessmentCtaEmail({
  patientName,
  portalUrl,
  clinician = COMPANY.clinicianFallback,
}: {
  patientName: string;
  portalUrl: string;
  clinician?: string;
}) {
  patientName = escapeHtml(patientName);
  clinician = escapeHtml(clinician);

  return layout(`
    <p>Hi ${patientName},</p>
    <p>The Inflection Edge is the foundation of everything ${clinician} does with you.</p>
    <p>It maps your ADHD profile across five dimensions — Arousal, Divergent Output, Hyperfocus, Volatility, and Environment Design. Each dimension produces a 0–100 score that tells ${clinician} where your highest-leverage intervention points are.</p>
    <p>Without it, ${clinician} is working blind. With it, your protocol can be designed before you even sit down together.</p>
    <p>It takes 5 minutes.</p>
    <p><a class="btn" href="${portalUrl}${PORTAL_ROUTES.assessment}">Take the Inflection Edge →</a></p>
  `);
}

// ─── Critical patient alert (to Manuel) ──────────────────────────────────────

export function criticalPatientAlertEmail({
  patientName,
  patientEmail,
  reason,
  adminUrl,
  recentCheckins = [],
  assessmentHistory = [],
}: {
  patientName: string;
  patientEmail: string;
  reason: string;
  adminUrl: string;
  recentCheckins?: { date: string; sleep: number; energy: number; mood: number; focus: number; stress: number }[];
  assessmentHistory?: { score: number; completedAt: string }[];
}) {
  patientName = escapeHtml(patientName);
  patientEmail = escapeHtml(patientEmail);

  const checkinsTable = recentCheckins.length > 0 ? `
    <p class="meta" style="margin-bottom:0.25rem"><strong>Recent check-ins</strong></p>
    <table style="width:100%;border-collapse:collapse;font-size:0.8rem;margin-bottom:0.5rem">
      <thead>
        <tr>
          <th style="text-align:left;color:${COLOR_MUTED};padding:0.15rem 0.4rem 0.15rem 0;font-weight:400">Date</th>
          <th style="text-align:center;color:${COLOR_MUTED};padding:0.15rem 0.2rem;font-weight:400">Sleep</th>
          <th style="text-align:center;color:${COLOR_MUTED};padding:0.15rem 0.2rem;font-weight:400">Energy</th>
          <th style="text-align:center;color:${COLOR_MUTED};padding:0.15rem 0.2rem;font-weight:400">Mood</th>
          <th style="text-align:center;color:${COLOR_MUTED};padding:0.15rem 0.2rem;font-weight:400">Focus</th>
          <th style="text-align:center;color:${COLOR_MUTED};padding:0.15rem 0.2rem;font-weight:400">Stress↑</th>
        </tr>
      </thead>
      <tbody>
        ${recentCheckins.map((c) => `
          <tr>
            <td style="color:${COLOR_INK2};padding:0.2rem 0.4rem 0.2rem 0">${c.date}</td>
            <td style="text-align:center;color:${metricColor(c.sleep)};font-weight:500;padding:0.2rem">${c.sleep}</td>
            <td style="text-align:center;color:${metricColor(c.energy)};font-weight:500;padding:0.2rem">${c.energy}</td>
            <td style="text-align:center;color:${metricColor(c.mood)};font-weight:500;padding:0.2rem">${c.mood}</td>
            <td style="text-align:center;color:${metricColor(c.focus)};font-weight:500;padding:0.2rem">${c.focus}</td>
            <td style="text-align:center;color:${metricColor(c.stress, true)};font-weight:500;padding:0.2rem">${c.stress}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>` : "";

  const assessmentLine = assessmentHistory.length >= 2
    ? `<p class="meta"><strong>Assessment:</strong> ${assessmentHistory[1].score} → ${assessmentHistory[0].score} / 100 (${assessmentHistory[0].completedAt})</p>`
    : assessmentHistory.length === 1
    ? `<p class="meta"><strong>Latest assessment:</strong> ${assessmentHistory[0].score} / 100 (${assessmentHistory[0].completedAt})</p>`
    : "";

  return layout(`
    <p>A patient has been flagged as <strong style="color:${COLOR_DANGER}">Critical</strong>.</p>
    <div class="divider"></div>
    <p class="meta"><strong>Patient:</strong> ${patientName} (${patientEmail})</p>
    <p class="meta"><strong>Reason:</strong> ${escapeHtml(reason)}</p>
    ${assessmentLine}
    ${checkinsTable}
    <div class="divider"></div>
    <p><a class="btn" href="${adminUrl}">View patient →</a></p>
    <p class="meta">This alert fires once per critical episode. It will not repeat until the patient returns to active or attention and becomes critical again.</p>
  `);
}

// ─── Assessment: immediate results ────────────────────────────────────────────

export function assessmentResultsEmail({
  patientName,
  overallScore,
  verdictName,
  verdictText,
  dimensions,
  portalUrl,
  clinician = COMPANY.clinicianFallback,
}: {
  patientName: string;
  overallScore: number;
  verdictName: string;
  verdictText: string;
  dimensions: Array<{ icon: string; name: string; score: number; interpretation: string }>;
  portalUrl: string;
  clinician?: string;
}) {
  patientName = escapeHtml(patientName);
  clinician = escapeHtml(clinician);

  const dimRows = dimensions
    .map(
      (d) => `
    <tr>
      <td style="padding:0.6rem 0;border-bottom:1px solid ${COLOR_BORDER};vertical-align:top;width:28px;font-size:1.1rem">${d.icon}</td>
      <td style="padding:0.6rem 0.5rem;border-bottom:1px solid ${COLOR_BORDER};vertical-align:top;font-size:0.78rem;color:${COLOR_MUTED};font-weight:600;text-transform:uppercase;letter-spacing:0.05em;width:40px">${d.score}</td>
      <td style="padding:0.6rem 0;border-bottom:1px solid ${COLOR_BORDER};vertical-align:top;">
        <div style="font-size:0.8rem;font-weight:500;color:${COLOR_INK};margin-bottom:0.25rem">${d.name}</div>
        <div style="font-size:0.76rem;color:${COLOR_INK2};line-height:1.6">${d.interpretation}</div>
      </td>
    </tr>`
    )
    .join("");

  return layout(`
    <p>Hi ${patientName},</p>
    <p>Your Inflection Edge results are in. Here is what your profile looks like:</p>
    <div style="text-align:center;padding:1.5rem 0">
      <div style="font-size:3.5rem;font-weight:300;color:${COLOR_TEAL};line-height:1">${overallScore}</div>
      <div style="font-size:0.85rem;font-weight:500;color:${COLOR_INK};margin-top:0.25rem">${verdictName}</div>
    </div>
    <p style="font-size:0.82rem;color:${COLOR_INK2};line-height:1.65">${verdictText}</p>
    <div class="divider"></div>
    <table style="width:100%;border-collapse:collapse">
      <tbody>${dimRows}</tbody>
    </table>
    <div class="divider"></div>
    <p><a class="btn" href="${portalUrl}">View full results in portal</a></p>
    <p class="meta">${sentenceCase(clinician)} will review your profile and be in touch about next steps.</p>
  `);
}

// ─── Assessment: clinical meaning (+48h) ──────────────────────────────────────

export function assessmentMeaningEmail({
  patientName,
  portalUrl,
  clinician = COMPANY.clinicianFallback,
}: {
  patientName: string;
  portalUrl: string;
  clinician?: string;
}) {
  patientName = escapeHtml(patientName);
  clinician = escapeHtml(clinician);

  return layout(`
    <p>Hi ${patientName},</p>
    <p>You took the Inflection Edge two days ago. This email explains what the five dimensions actually measure — and why they matter clinically.</p>
    <div class="divider"></div>
    <p><strong>⚡ Arousal &amp; Activation</strong><br/>
    This is your ability to initiate. Most ADHD interventions start here because without reliable activation, nothing else works. ${clinician} looks at whether the barrier to starting is biological (dopamine regulation), structural (environment), or habitual.</p>
    <p><strong>💥 Divergent Output</strong><br/>
    Raw creative capacity. ADHD brains often generate more ideas than neurotypical ones — the clinical question is whether that output is captured, developed, and deployed, or scattered. ${clinician} tracks the gap between ideation and execution.</p>
    <p><strong>🎯 Hyperfocus</strong><br/>
    Your ability to enter deep, extended flow states. When managed well, hyperfocus is an asymmetric advantage. When uncontrolled, it burns time and relationships. ${clinician} maps how deliberate versus reactive your hyperfocus currently is.</p>
    <p><strong>🌊 Volatility &amp; Cost</strong><br/>
    Emotional and performance variance. The real-world cost of ADHD is often paid here — in decisions made in the wrong state, relationships affected by unpredictability, and energy spent on recovery. This is where biological stabilisation has the most direct impact.</p>
    <p><strong>🏗️ Environment Design</strong><br/>
    How well your workspace, schedule, and relationships are engineered around your neurotype. Environmental design compounds everything else — even perfect biological intervention underperforms in the wrong environment.</p>
    <div class="divider"></div>
    <p><a class="btn" href="${portalUrl}">Review your scores</a></p>
  `);
}

// ─── Assessment: booking CTA (+5 days) ────────────────────────────────────────

export function assessmentBookingEmail({
  patientName,
  overallScore,
  portalUrl,
  clinician = COMPANY.clinicianFallback,
}: {
  patientName: string;
  overallScore: number;
  portalUrl: string;
  clinician?: string;
}) {
  patientName = escapeHtml(patientName);
  clinician = escapeHtml(clinician);

  return layout(`
    <p>Hi ${patientName},</p>
    <p>${sentenceCase(clinician)} has had time to review your Inflection Edge profile (overall score: <strong>${overallScore}/100</strong>).</p>
    <p>If you would like to discuss what your results mean for your specific situation — and what interventions are most relevant for your neurotype — you can book a consultation directly.</p>
    <p><a class="btn" href="${portalUrl}${PORTAL_ROUTES.bookings}">Book a consultation</a></p>
    <div class="divider"></div>
    <p class="meta">If you have already booked, you can safely ignore this email.</p>
  `);
}

// ─── Weekly digest ────────────────────────────────────────────────────────────

type WeekAvgs = Record<MetricKey, number> | null;

/** Minimum delta (on 1–5 scale) to count as a meaningful change */
const INSIGHT_DELTA_THRESHOLD = 0.3;

type MetricInsight = { label: string; delta: number };

/**
 * Generates a one-sentence clinical synthesis of the week's data.
 * Returns null when there is no previous week to compare against.
 * Stress is inverted: higher raw stress = worse outcome.
 */
function weeklyInsight(
  curr: Record<MetricKey, number>,
  prev: Record<MetricKey, number> | null,
  clinician: string
): string | null {
  if (!prev) return `First week of data on record — ${clinician} now has a baseline to track against.`;

  const metrics: MetricInsight[] = [
    { label: "sleep",  delta: curr.sleep  - prev.sleep },
    { label: "energy", delta: curr.energy - prev.energy },
    { label: "mood",   delta: curr.mood   - prev.mood },
    { label: "focus",  delta: curr.focus  - prev.focus },
    { label: "stress", delta: -(curr.stress - prev.stress) }, // inverted: lower stress = better
  ];

  const improved = metrics
    .filter((m) => m.delta >= INSIGHT_DELTA_THRESHOLD)
    .sort((a, b) => b.delta - a.delta);
  const declined = metrics
    .filter((m) => m.delta <= -INSIGHT_DELTA_THRESHOLD)
    .sort((a, b) => a.delta - b.delta);

  const fmt = (list: MetricInsight[], max = 3) =>
    list
      .slice(0, max)
      .map((m) => m.label)
      .join(", ")
      .replace(/, ([^,]*)$/, " and $1"); // Oxford-comma-less "X, Y and Z"

  if (improved.length === 0 && declined.length === 0) {
    return "Steady week — your patterns held consistent.";
  }
  if (improved.length > 0 && declined.length === 0) {
    return `Strong week — ${fmt(improved)} improved.`;
  }
  if (declined.length > 0 && improved.length === 0) {
    return `${fmt(declined)} dipped this week — consistent check-ins help ${clinician} catch these early.`;
  }
  // Mixed: name the biggest mover in each direction
  return `${improved[0].label} improved while ${declined[0].label} dipped.`;
}

function deltaArrow(curr: number, prev: number): string {
  if (curr > prev + 0.1) return "↑";
  if (curr < prev - 0.1) return "↓";
  return "→";
}

function metricRow(label: string, curr: number | undefined, prev: number | undefined, invert = false): string {
  if (curr == null || prev == null) return "";
  const displayCurr = invert ? 6 - curr : curr;
  const displayPrev = invert ? 6 - prev : prev;
  const arrow = deltaArrow(displayCurr, displayPrev);
  const color = arrow === "↑" ? COLOR_TEAL : arrow === "↓" ? COLOR_DANGER : COLOR_MUTED;
  return `<tr>
    <td style="padding:0.35rem 0;font-size:0.8rem;color:${COLOR_MUTED};width:120px">${label}</td>
    <td style="padding:0.35rem 0;font-size:0.8rem;color:${COLOR_INK}">${displayCurr.toFixed(1)}</td>
    <td style="padding:0.35rem 0;font-size:0.9rem;color:${color};font-weight:600">${arrow}</td>
    <td style="padding:0.35rem 0;font-size:0.8rem;color:${COLOR_MUTED}">${displayPrev.toFixed(1)}</td>
  </tr>`;
}

type DigestGoal = { title: string; pct: number; current: number; target: number };

export function weeklyDigestEmail({
  patientName,
  thisWeekAvgs,
  prevWeekAvgs,
  latestScore,
  verdictName,
  nextBookingStatus,
  activeGoals = [],
  portalUrl,
  streak = 0,
  clinician = COMPANY.clinicianFallback,
}: {
  patientName: string;
  thisWeekAvgs: WeekAvgs;
  prevWeekAvgs: WeekAvgs;
  latestScore: number | null;
  verdictName: string | null;
  nextBookingStatus: string | null;
  activeGoals?: DigestGoal[];
  portalUrl: string;
  streak?: number;
  clinician?: string;
}) {
  patientName = escapeHtml(patientName);
  clinician = escapeHtml(clinician);

  const hasCheckins = thisWeekAvgs !== null;
  const insight = hasCheckins ? weeklyInsight(thisWeekAvgs!, prevWeekAvgs, clinician) : null;

  const checkinSection = hasCheckins ? `
    ${insight ? `<p style="font-size:0.9rem;color:${COLOR_INK};font-style:italic;margin-bottom:1rem">${insight}</p>` : ""}
    <p><strong>This week's check-in averages</strong></p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:0.5rem">
      <thead>
        <tr>
          <th style="text-align:left;font-size:0.7rem;color:${COLOR_MUTED};padding:0.2rem 0">Metric</th>
          <th style="text-align:left;font-size:0.7rem;color:${COLOR_MUTED};padding:0.2rem 0">This week</th>
          <th style="text-align:left;font-size:0.7rem;color:${COLOR_MUTED};padding:0.2rem 0">Δ</th>
          <th style="text-align:left;font-size:0.7rem;color:${COLOR_MUTED};padding:0.2rem 0">Last week</th>
        </tr>
      </thead>
      <tbody>
        ${metricRow("Sleep", thisWeekAvgs!.sleep, prevWeekAvgs?.sleep)}
        ${metricRow("Energy", thisWeekAvgs!.energy, prevWeekAvgs?.energy)}
        ${metricRow("Mood", thisWeekAvgs!.mood, prevWeekAvgs?.mood)}
        ${metricRow("Focus", thisWeekAvgs!.focus, prevWeekAvgs?.focus)}
        ${metricRow("Stress (low=good)", thisWeekAvgs!.stress, prevWeekAvgs?.stress, true)}
      </tbody>
    </table>
    <div class="divider"></div>` : `
    <p class="meta">No check-ins this week. Consistent tracking helps ${clinician} see your patterns clearly.</p>
    <div class="divider"></div>`;

  const assessmentSection = latestScore !== null ? `
    <p><strong>Latest Inflection Edge score:</strong> ${latestScore}/100 — ${verdictName ?? ""}</p>` : "";

  const bookingSection = nextBookingStatus ? `
    <p class="meta">Your next consultation is <strong>${nextBookingStatus}</strong>.</p>` : "";

  const goalsSection = activeGoals.length > 0 ? `
    <div class="divider"></div>
    <p><strong>Clinical goal progress</strong></p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:0.5rem">
      <tbody>
        ${activeGoals.map((g) => {
          const escaped = escapeHtml(g.title);
          const barWidth = Math.min(100, g.pct);
          const barColor = g.pct >= 60 ? COLOR_TEAL : g.pct >= 30 ? COLOR_GOLD : COLOR_MUTED;
          return `<tr>
            <td style="padding:0.4rem 0.5rem 0.4rem 0;font-size:0.85rem;color:${COLOR_INK2};vertical-align:middle;width:50%">${escaped}</td>
            <td style="padding:0.4rem 0;vertical-align:middle">
              <div style="background:${COLOR_LIGHT};border-radius:3px;height:6px;width:100%">
                <div style="background:${barColor};border-radius:3px;height:6px;width:${barWidth}%"></div>
              </div>
            </td>
            <td style="padding:0.4rem 0 0.4rem 0.5rem;font-size:0.8rem;color:${COLOR_MUTED};white-space:nowrap;vertical-align:middle">${g.pct}% · ${g.current}→${g.target}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>` : "";

  const streakSection = streak >= 3
    ? `<p style="font-size:0.9rem;color:${COLOR_TEAL};font-weight:500;margin-bottom:0.5rem">🔥 ${escapeHtml(streakMessage(streak))}</p>`
    : "";

  return layout(`
    <p>Hi ${patientName},</p>
    <p>Your weekly summary from ${COMPANY.shortName}.</p>
    ${streakSection}
    ${checkinSection}
    ${assessmentSection}
    ${goalsSection}
    ${bookingSection}
    <p><a class="btn" href="${portalUrl}${PORTAL_ROUTES.checkin}">Log today's check-in</a></p>
    <div class="divider"></div>
    <p class="meta">To stop receiving weekly summaries, visit your <a href="${portalUrl}${PORTAL_ROUTES.profile}#email-preferences" style="color:${COLOR_TEAL}">profile settings</a>.</p>
  `);
}

// ─── Daily check-in reminder ──────────────────────────────────────────────────

export function checkinReminderEmail({
  patientName,
  portalUrl,
  atRiskStreak = 0,
  clinician = COMPANY.clinicianFallback,
}: {
  patientName: string;
  portalUrl: string;
  atRiskStreak?: number;
  clinician?: string;
}) {
  patientName = escapeHtml(patientName);
  clinician = escapeHtml(clinician);

  const streakLine = atRiskStreak >= 2
    ? `<p style="font-size:1rem;font-weight:600;color:${COLOR_INK}">🔥 ${atRiskStreak}-day streak — don't break it now.</p>`
    : "";
  const bodyLine = atRiskStreak >= 2
    ? `<p>You've logged ${atRiskStreak} days in a row. One more entry keeps your streak alive and gives ${clinician} a complete picture of your week.</p>`
    : `<p>Logging your daily check-in takes 30 seconds and helps ${clinician} track your progress across sleep, energy, mood, focus, and stress.</p>`;

  return layout(`
    <p>Hi <strong>${patientName}</strong>,</p>
    ${streakLine}
    ${bodyLine}
    <p><a class="btn" href="${portalUrl}${PORTAL_ROUTES.checkin}">Log today's check-in →</a></p>
    <div class="divider"></div>
    <p class="meta">You receive this reminder on days when you haven&apos;t logged a check-in yet. To stop, update your <a href="${portalUrl}${PORTAL_ROUTES.profile}#email-preferences" style="color:${COLOR_TEAL}">email preferences</a>.</p>
  `);
}

// ─── Check-in dip alert (to Manuel) ──────────────────────────────────────────

export function checkinDipAlertEmail({
  patientName,
  patientEmail,
  avgScore,
  days,
  adminUrl,
  dipDays = [],
}: {
  patientName: string;
  patientEmail: string;
  avgScore: number;
  days: number;
  adminUrl: string;
  dipDays?: { date: string; sleep: number; energy: number; mood: number; focus: number; stress: number; note?: string }[];
}) {
  patientName = escapeHtml(patientName);
  patientEmail = escapeHtml(patientEmail);

  const dipTable = dipDays.length > 0 ? `
    <table style="width:100%;border-collapse:collapse;margin-top:0.5rem;font-size:0.8rem">
      <thead>
        <tr>
          <th style="text-align:left;color:${COLOR_MUTED};padding:0.15rem 0.4rem 0.15rem 0;font-weight:400">Date</th>
          <th style="text-align:center;color:${COLOR_MUTED};padding:0.15rem 0.2rem;font-weight:400">Sleep</th>
          <th style="text-align:center;color:${COLOR_MUTED};padding:0.15rem 0.2rem;font-weight:400">Energy</th>
          <th style="text-align:center;color:${COLOR_MUTED};padding:0.15rem 0.2rem;font-weight:400">Mood</th>
          <th style="text-align:center;color:${COLOR_MUTED};padding:0.15rem 0.2rem;font-weight:400">Focus</th>
          <th style="text-align:center;color:${COLOR_MUTED};padding:0.15rem 0.2rem;font-weight:400">Stress↑</th>
        </tr>
      </thead>
      <tbody>
        ${dipDays.map((d) => `
          <tr>
            <td style="color:${COLOR_INK2};padding:0.2rem 0.4rem 0.2rem 0">${d.date}</td>
            <td style="text-align:center;color:${metricColor(d.sleep)};font-weight:500;padding:0.2rem">${d.sleep}</td>
            <td style="text-align:center;color:${metricColor(d.energy)};font-weight:500;padding:0.2rem">${d.energy}</td>
            <td style="text-align:center;color:${metricColor(d.mood)};font-weight:500;padding:0.2rem">${d.mood}</td>
            <td style="text-align:center;color:${metricColor(d.focus)};font-weight:500;padding:0.2rem">${d.focus}</td>
            <td style="text-align:center;color:${metricColor(d.stress, true)};font-weight:500;padding:0.2rem">${d.stress}</td>
          </tr>
          ${d.note ? `<tr><td colspan="6" style="color:${COLOR_MUTED};font-style:italic;padding:0.1rem 0 0.3rem 0;font-size:0.75rem">"${escapeHtml(d.note)}"</td></tr>` : ""}
        `).join("")}
      </tbody>
    </table>` : "";

  return layout(`
    <p>A patient has had consistently low wellbeing scores for the past <strong>${days} days</strong>.</p>
    <div class="divider"></div>
    <p class="meta"><strong>Patient:</strong> ${patientName} (${patientEmail})</p>
    <p class="meta"><strong>Average (mood + energy + sleep):</strong> ${avgScore.toFixed(1)} / 5</p>
    ${dipTable}
    <div class="divider"></div>
    <p><a class="btn" href="${adminUrl}">View patient →</a></p>
    <p class="meta">This alert fires once per dip episode and resets when the patient returns above the threshold.</p>
  `);
}

// ─── Check-in streak milestone (to patient) ──────────────────────────────────

export function checkinStreakMilestoneEmail({
  patientName,
  streak,
  portalUrl,
  clinician = COMPANY.clinicianFallback,
}: {
  patientName: string;
  streak: number;
  portalUrl: string;
  clinician?: string;
}) {
  patientName = escapeHtml(patientName);
  clinician = escapeHtml(clinician);

  const [STREAK_7, STREAK_30, STREAK_100] = CHECKIN_STREAK_MILESTONES;
  let heading: string;
  let body: string;
  if (streak >= STREAK_100) {
    heading = `${STREAK_100}-day streak`;
    body = "One hundred consecutive days of data. That is not a streak — that is a dataset. Your protocol can now be tuned with a precision most patients never reach.";
  } else if (streak >= STREAK_30) {
    heading = `${STREAK_30}-day streak`;
    body = `A full month of daily check-ins. The trend lines are real now — ${clinician} can see patterns that a handful of sessions would never reveal.`;
  } else {
    heading = `${STREAK_7}-day streak`;
    body = "One full week logged. Seven data points in a row is where the signal starts to separate from the noise. Keep going.";
  }

  return layout(`
    <p>Hi ${patientName},</p>
    <p>🔥 <strong>${heading}</strong> — you just hit a milestone.</p>
    <p>${body}</p>
    <div class="divider"></div>
    <p>Every check-in you complete adds resolution to your clinical picture. The data you log today is the baseline ${clinician} uses to measure whether your programme is working.</p>
    <p><a class="btn" href="${portalUrl}${PORTAL_ROUTES.checkin}">Log today's check-in</a></p>
    <p class="meta">You're receiving this because you hit a check-in streak milestone. Keep the streak alive.</p>
  `);
}

// ─── Profile completion alert (to Manuel) ────────────────────────────────────

export function profileCompletedAdminEmail({
  patientName,
  patientEmail,
  completionPct,
  adminUrl,
}: {
  patientName: string;
  patientEmail: string;
  completionPct: number;
  adminUrl: string;
}) {
  patientName = escapeHtml(patientName);
  patientEmail = escapeHtml(patientEmail);

  return layout(`
    <p>A patient has completed their intake profile — <strong style="color:${COLOR_TEAL}">ready for review</strong>.</p>
    <div class="divider"></div>
    <p class="meta"><strong>Patient:</strong> ${patientName} (${patientEmail})</p>
    <p class="meta"><strong>Profile completeness:</strong> ${completionPct}%</p>
    <div class="divider"></div>
    <p><a class="btn" href="${adminUrl}">Review profile →</a></p>
    <p class="meta">This notification fires once when the patient first crosses 70% completion.</p>
  `);
}

// ─── Goal achieved (to admin) ─────────────────────────────────────────────────

export function goalAchievedAdminEmail({
  patientName,
  goalTitle,
  adminUrl,
}: {
  patientName: string;
  goalTitle: string;
  adminUrl: string;
}) {
  patientName = escapeHtml(patientName);
  goalTitle = escapeHtml(goalTitle);

  return layout(`
    <p>A patient has reached their clinical goal — <strong style="color:${COLOR_TEAL}">achieved</strong>.</p>
    <div class="divider"></div>
    <p class="meta"><strong>Patient:</strong> ${patientName}</p>
    <p class="meta"><strong>Goal:</strong> ${goalTitle}</p>
    <div class="divider"></div>
    <p><a class="btn" href="${adminUrl}">View patient →</a></p>
    <p class="meta">The goal has been automatically marked complete. Consider acknowledging this with the patient.</p>
  `);
}

// ─── Goal achieved (to patient) ───────────────────────────────────────────────

export function goalAchievedPatientEmail({
  patientName,
  goalTitle,
  portalUrl,
  clinician = COMPANY.clinicianFallback,
}: {
  patientName: string;
  goalTitle: string;
  portalUrl: string;
  clinician?: string;
}) {
  patientName = escapeHtml(patientName);
  goalTitle = escapeHtml(goalTitle);
  clinician = escapeHtml(clinician);

  return layout(`
    <p>Hi ${patientName},</p>
    <p>You&rsquo;ve reached your clinical goal — <strong style="color:${COLOR_TEAL}">${goalTitle}</strong>.</p>
    <p>This is a real milestone. Your consistent check-ins and assessments made it visible — and now it&rsquo;s recorded as complete.</p>
    <div class="divider"></div>
    <p><a class="btn" href="${portalUrl}${PORTAL_ROUTES.goals}">View your goals →</a></p>
    <p class="meta">${sentenceCase(clinician)} has also been notified. Well done.</p>
  `);
}

// ─── Document shared with patient ─────────────────────────────────────────────

export function newDocumentEmail({
  patientName,
  title,
  portalUrl,
  // The person who actually uploaded it — NOT the patient's primary clinician.
  // Any member of the care team can share a document, and telling the patient
  // the wrong doctor sent their lab result is worse than not naming anyone.
  sharedBy = COMPANY.clinicianFallback,
}: {
  patientName: string;
  title: string;
  portalUrl: string;
  sharedBy?: string;
}) {
  patientName = escapeHtml(patientName);
  title = escapeHtml(title);
  sharedBy = escapeHtml(sharedBy);

  return layout(`
    <p>Hi ${patientName},</p>
    <p>${sentenceCase(sharedBy)} has shared a new document with you: <strong>${title}</strong></p>
    <p>Open it directly in your patient portal.</p>
    <p><a class="btn" href="${portalUrl}${PORTAL_ROUTES.documents}">View documents →</a></p>
  `);
}

// ─── Document uploaded BY the patient (to their care team) ────────────────────

export function patientDocumentUploadedEmail({
  patientName,
  title,
  adminUrl,
}: {
  patientName: string;
  title: string;
  adminUrl: string;
}) {
  patientName = escapeHtml(patientName);
  title = escapeHtml(title);

  return layout(`
    <p>A patient has added a document to their own record.</p>
    <div class="divider"></div>
    <p class="meta"><strong>Patient:</strong> ${patientName}</p>
    <p class="meta"><strong>Document:</strong> ${title}</p>
    <div class="divider"></div>
    <p><a class="btn" href="${adminUrl}">Open patient record →</a></p>
  `);
}

// ─── Programme assigned (to patient) ──────────────────────────────────────────

export function programmeAssignedEmail({
  patientName,
  programmeLabel,
  phaseLabel,
  phaseDescription,
  portalUrl,
  // The admin who performed the enrolment, not the primary clinician.
  enrolledBy = COMPANY.clinicianFallback,
}: {
  patientName: string;
  programmeLabel: string;
  phaseLabel: string;
  phaseDescription: string;
  portalUrl: string;
  enrolledBy?: string;
}) {
  patientName = escapeHtml(patientName);
  programmeLabel = escapeHtml(programmeLabel);
  phaseLabel = escapeHtml(phaseLabel);
  phaseDescription = escapeHtml(phaseDescription);
  enrolledBy = escapeHtml(enrolledBy);

  return layout(`
    <p>Hi ${patientName},</p>
    <p>${sentenceCase(enrolledBy)} has enrolled you in a clinical programme: <strong>${programmeLabel}</strong></p>
    <div class="divider"></div>
    <p class="meta"><strong>Current phase:</strong> ${phaseLabel}</p>
    <p>${phaseDescription}</p>
    <div class="divider"></div>
    <p><a class="btn" href="${portalUrl}${PORTAL_ROUTES.dashboard}">Open your portal →</a></p>
  `);
}
