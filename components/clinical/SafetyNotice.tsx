import shared from "@/app/shared.module.css";
import { COMPANY, EMERGENCY_CONTACTS } from "@/lib/config/company";

/**
 * What to do if something here is frightening.
 *
 * EMERGENCY_CONTACTS has existed in config since the regulatory work and was
 * rendered nowhere, which is the same as not having it. This is the component
 * that makes it real, and it belongs anywhere a patient can meet a number or a
 * sentence that alarms them at eleven at night.
 *
 * The wording does two jobs at once, and both matter:
 *
 *  — SAFETY. Someone reading "Review" against their own blood pressure needs to
 *    know, in that moment, what the right next action is. "Ask your doctor at
 *    your next appointment" is not an answer to a person who is frightened now.
 *
 *  — SCOPE. This platform records and displays; it does not diagnose and it is
 *    not monitored around the clock. Saying so plainly is not a disclaimer
 *    hedge, it is the truthful description of what the software is, and it is
 *    what keeps a patient from treating a portal page as a clinician on call.
 */
export function SafetyNotice({ variant = "results" }: { variant?: "results" | "message" }) {
  return (
    <div className={shared.legalNotice}>
      <p className={shared.legalNoticeTitle}>
        {variant === "message"
          ? "Messages are not monitored around the clock"
          : "What these numbers are, and are not"}
      </p>
      <p className={shared.legalNoticeLaw}>
        {variant === "message"
          ? `Messages here reach ${COMPANY.shortName} during working hours. They are not a way to reach anyone urgently.`
          : `These are recorded measurements shown against published reference intervals. A value outside an interval is not a diagnosis, and a value inside one is not proof of health — only your clinician, who knows the rest of your situation, can say what a result means for you.`}
      </p>
      <p className={shared.legalNoticeLaw}>
        If you are unwell now, or worried about your safety, do not wait for a reply:
      </p>
      {EMERGENCY_CONTACTS.map((c) => (
        <p key={`${c.region}-${c.number}`} className={shared.legalNoticeLaw}>
          <strong>{c.number}</strong> — {c.label} ({c.region})
        </p>
      ))}
    </div>
  );
}
