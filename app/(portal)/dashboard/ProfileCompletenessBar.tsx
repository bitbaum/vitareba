import Link from "next/link";
import shared from "../portal.module.css";
import styles from "./dashboard.module.css";
import { profileCompletenessClass } from "@/lib/domain/profile";
import { COMPANY } from "@/lib/config/company";
import { PROFILE_COMPLETENESS_LOW_PCT, PROFILE_COMPLETENESS_HIGH_PCT } from "@/lib/config/portal";
import { PORTAL_ROUTES } from "@/lib/config/routes";

const MAX_SHOWN_FIELDS = 3;

export function ProfileCompletenessBar({
  pct,
  missingFields = [],
  clinician = COMPANY.clinicianFallback,
}: {
  pct: number;
  missingFields?: string[];
  clinician?: string;
}) {
  if (pct >= 100) return null;

  const shown = missingFields.slice(0, MAX_SHOWN_FIELDS);
  const remainder = missingFields.length - shown.length;

  return (
    <div className={styles.profileBar}>
      <div className={styles.profileBarHeader}>
        <p className={shared.cardTitleFlush}>Intake profile</p>
        <span className={`${styles.profileBarPct} ${profileCompletenessClass(pct)}`}>
          {pct}%
        </span>
      </div>
      <div className={styles.profileBarTrack}>
        <div className={shared.progressFill} style={{ width: `${pct}%` }} />
      </div>
      <p className={styles.profileBarText}>
        {pct < PROFILE_COMPLETENESS_LOW_PCT
          ? `A full profile lets ${clinician} arrive at your consultation already knowing your context — not spending the first 20 minutes gathering basics.`
          : pct < PROFILE_COMPLETENESS_HIGH_PCT
          ? `Almost there — a complete profile means ${clinician} can design your programme before you even walk in the door.`
          : `Just a few fields left — complete your profile so ${clinician} has the full picture.`}
        {" "}
        <Link href={PORTAL_ROUTES.profile} className={styles.profileBarLink}>
          Complete profile →
        </Link>
      </p>
      {shown.length > 0 && (
        <p className={styles.profileBarMissing}>
          Missing:{" "}
          {shown.map((f, i) => (
            <span key={f} className={styles.profileBarMissingField}>
              {f}{i < shown.length - 1 || remainder > 0 ? "," : ""}
            </span>
          ))}
          {remainder > 0 && <span> and {remainder} more</span>}
        </p>
      )}
    </div>
  );
}
