import styles from "./LoadingState.module.css";

/**
 * Shared async loading state — shimmering skeleton lines instead of a bare
 * "Loading…" string. Used by every client view that fetches on mount.
 */
export function LoadingState({ lines = 3 }: { lines?: number }) {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className={styles.lines} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className={styles.line} />
        ))}
      </div>
    </div>
  );
}
