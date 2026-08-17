import type { ReactNode } from "react";
import styles from "@/app/(portal)/portal.module.css";

type Props = {
  /** e.g. <>My <em>Bookings</em></> — the teal-italic emphasis is styling on .pageTitle em */
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned beside the title/subtitle block — a single primary button. */
  action?: ReactNode;
};

/**
 * Every portal page's title + subtitle + optional action button — one
 * definition instead of ~11 hand-rolled copies. Two of those copies (goals,
 * documents) duplicated the block twice in the same file for its empty vs.
 * loaded state and had already drifted from each other (goals' empty state
 * was missing the teal italic emphasis the rest of the portal uses). A
 * single component can't drift.
 */
export function PortalPageHeader({ title, subtitle, action }: Props) {
  return (
    <div className={styles.pageHeader}>
      <div>
        <h1 className={styles.pageTitle}>{title}</h1>
        {subtitle && <p className={styles.pageSub}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
