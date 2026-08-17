"use client";

import { useEffect, useState, type ReactNode } from "react";
import styles from "@/app/(admin)/admin.module.css";

export type Section = { id: string; label: string; content: ReactNode };

/**
 * Progressive disclosure for long admin pages: one tab bar, all panels stay
 * mounted (hidden) so form state survives switching. The active tab is
 * mirrored into the URL hash so refresh / share keeps the open section.
 */
export function SectionTabs({
  sections,
  ariaLabel = "Section tabs",
}: {
  sections: Section[];
  ariaLabel?: string;
}) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    if (fromHash && sections.some((s) => s.id === fromHash)) setActive(fromHash);
  }, [sections]);

  function select(id: string) {
    setActive(id);
    history.replaceState(null, "", `#${id}`);
  }

  return (
    <div>
      <div className={styles.filterBar} role="tablist" aria-label={ariaLabel}>
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            id={`tab-${s.id}`}
            aria-selected={active === s.id}
            aria-controls={`panel-${s.id}`}
            onClick={() => select(s.id)}
            className={`${styles.filterTab}${active === s.id ? ` ${styles.filterTabActive}` : ""}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {sections.map((s) => (
        <div
          key={s.id}
          role="tabpanel"
          id={`panel-${s.id}`}
          aria-labelledby={`tab-${s.id}`}
          hidden={active !== s.id}
        >
          {s.content}
        </div>
      ))}
    </div>
  );
}
