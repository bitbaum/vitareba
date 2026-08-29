import shared from "@/app/shared.module.css";
import { getRegulatoryBlock } from "@/lib/config/regulation";
import { PORTAL_ROUTES } from "@/lib/config/routes";

/**
 * The legal warning label. Two modes:
 *  - gate reasons (no_consent / ai_not_configured): the feature refused to run
 *    this time (HTTP 451) and this explains which law and how to open the gate.
 *  - warning reasons (device_warning / dpa_warning): the feature RAN — house
 *    rule, the law is a warning not a wall — and this is the label telling you
 *    exactly what you were just warned about.
 */
export function RegulationNotice({
  blockId,
  reason,
}: {
  blockId: string;
  reason?:
    | "no_consent"
    | "no_patient_consent"
    | "ai_not_configured"
    | "blocked"
    | "device_warning"
    | "dpa_warning";
}) {
  const block = getRegulatoryBlock(blockId);
  if (!block) return null;

  const isWarning = reason === "device_warning" || reason === "dpa_warning";

  const detail =
    reason === "no_consent"
      ? "It needs your explicit consent first (GDPR Art. 9). One click below records it — timestamped, withdrawable any time in your profile."
      : reason === "no_patient_consent"
        ? "This patient has not given explicit consent for AI processing of their health data (GDPR Art. 9). Consent is theirs alone to give — you cannot record it on their behalf. They can switch it on in their profile privacy settings."
        : reason === "ai_not_configured"
          ? "No AI provider is connected yet — a technical gap, not a legal one. Once the clinic sets one up, this runs (with a warning if the provider lacks an EU data-processing agreement)."
          : reason === "device_warning"
            ? "This output is NOT a diagnosis and this software is NOT a CE-marked medical device (MDR 2017/745 / Swiss MedDO). It surfaces hypotheses; clinical judgment and full responsibility remain with the clinician reading it."
            : reason === "dpa_warning"
              ? "This ran on an AI provider without a signed EU/CH data-processing agreement. Your health data crossed that line with your consent — GDPR Ch. V and Schrems II are why this warning exists."
              : block.statusDetail;

  return (
    <div className={shared.legalNotice} role="note">
      <p className={shared.legalNoticeTitle}>
        {isWarning ? "⚠ Legal warning — it ran anyway" : "Paused by law — one step to run it"}
      </p>
      <p>
        <strong>{block.feature}:</strong> {detail}
      </p>
      {block.laws.slice(0, 2).map((law) => (
        <p key={law.cite} className={shared.legalNoticeLaw}>
          ⚖ <strong>{law.name}</strong> ({law.cite}) — passed by {law.passedBy}; {law.keyPeople}.
        </p>
      ))}
      <p className={shared.legalNoticeLaw}>
        <a className={shared.legalNoticeLink} href={`${PORTAL_ROUTES.regulation}#${block.id}`}>
          Full story: who passed it and who benefits →
        </a>
      </p>
    </div>
  );
}
