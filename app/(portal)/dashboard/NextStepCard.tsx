import Link from "next/link";
import styles from "./dashboard.module.css";
import type { NextStep } from "@/lib/domain/next-step";

/**
 * The one thing to do next — first element of the dashboard, whole card
 * tappable. Mobile-first: big touch target, two short lines, no scanning.
 */
export function NextStepCard({ step }: { step: NextStep }) {
  if (step.key === "done") {
    return (
      <Link href={step.href} className={styles.nextStepDone}>
        <span className={styles.nextStepCheck} aria-hidden>
          ✓
        </span>
        <span>
          <span className={styles.nextStepLabelMuted}>{step.label}</span>
          <span className={styles.nextStepSubMuted}>{step.sub}</span>
        </span>
        <span className={styles.nextStepArrow} aria-hidden>
          →
        </span>
      </Link>
    );
  }
  return (
    <Link
      href={step.href}
      className={step.urgent ? styles.nextStepUrgent : styles.nextStep}
    >
      <span>
        <span className={styles.nextStepEyebrow}>Next step</span>
        <span className={styles.nextStepLabel}>{step.label}</span>
        <span className={styles.nextStepSub}>{step.sub}</span>
      </span>
      <span className={styles.nextStepArrow} aria-hidden>
        →
      </span>
    </Link>
  );
}
