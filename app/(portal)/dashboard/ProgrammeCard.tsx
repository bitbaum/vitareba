import { PROGRAMME_CONFIG, PHASE_CONFIG, phaseDescription } from "@/lib/config/programmes";
import type { ProgrammeKey, PhaseKey } from "@/lib/config/programmes";
import { COMPANY } from "@/lib/config/company";
import shared from "../portal.module.css";
import styles from "./dashboard.module.css";

export function ProgrammeCard({
  programme,
  phase,
  clinician = COMPANY.clinicianFallback,
}: {
  programme: ProgrammeKey;
  phase: PhaseKey;
  /** Resolved from care_team by the page — never a name from config. */
  clinician?: string;
}) {
  const prog = PROGRAMME_CONFIG[programme];
  const ph = PHASE_CONFIG[phase];

  return (
    <div className={shared.card}>
      <p className={shared.cardTitle}>Your Programme</p>
      <p className={styles.progName}>{prog.label}</p>
      <p className={styles.progPhase}>{ph.label}</p>
      <p className={styles.progDesc}>{phaseDescription(phase, clinician)}</p>
    </div>
  );
}
