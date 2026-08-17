"use client";

import shared from "@/app/shared.module.css";
import styles from "@/app/(admin)/admin.module.css";
import { ISO_WEEKDAY_LABELS, type WeeklyHours } from "@/lib/config/scheduling";

/**
 * A clinician's actual working hours — a real day×window grid, not a JSON
 * blob a developer had to hand-edit in source. Each day is a list of
 * [start,end) windows so "9–12, then 13:30–17" is expressible without a
 * separate "lunch break" concept.
 */
export function WeeklyHoursEditor({
  value,
  onChange,
}: {
  value: WeeklyHours;
  onChange: (next: WeeklyHours) => void;
}) {
  function setDay(iso: string, windows: [string, string][]) {
    onChange({ ...value, [iso]: windows });
  }

  function addWindow(iso: string) {
    const windows = value[Number(iso)] ?? [];
    setDay(iso, [...windows, ["09:00", "17:00"]]);
  }

  function updateWindow(iso: string, index: number, which: 0 | 1, time: string) {
    const windows = [...(value[Number(iso)] ?? [])];
    const window: [string, string] = [...windows[index]] as [string, string];
    window[which] = time;
    windows[index] = window;
    setDay(iso, windows);
  }

  function removeWindow(iso: string, index: number) {
    const windows = (value[Number(iso)] ?? []).filter((_, i) => i !== index);
    setDay(iso, windows);
  }

  return (
    <div className={styles.hoursGrid}>
      {Object.entries(ISO_WEEKDAY_LABELS).map(([iso, label]) => {
        const windows = value[Number(iso)] ?? [];
        return (
          <div key={iso} className={styles.hoursRow}>
            <span className={styles.hoursDayLabel}>{label}</span>
            <div className={styles.hoursWindows}>
              {windows.length === 0 ? (
                <span className={shared.metaSm}>Closed</span>
              ) : (
                windows.map((w, i) => (
                  <div key={i} className={styles.hoursWindow}>
                    <input
                      type="time"
                      className={styles.hoursTimeInput}
                      value={w[0]}
                      onChange={(e) => updateWindow(iso, i, 0, e.target.value)}
                      aria-label={`${label} window ${i + 1} start`}
                    />
                    <span aria-hidden="true">–</span>
                    <input
                      type="time"
                      className={styles.hoursTimeInput}
                      value={w[1]}
                      onChange={(e) => updateWindow(iso, i, 1, e.target.value)}
                      aria-label={`${label} window ${i + 1} end`}
                    />
                    <button
                      type="button"
                      className={shared.btnText}
                      onClick={() => removeWindow(iso, i)}
                      aria-label={`Remove ${label} window ${i + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
              <button type="button" className={shared.btnText} onClick={() => addWindow(iso)}>
                + Add a window
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
