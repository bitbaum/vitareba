import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  // Reached by anonymous visitors too (unmatched non-locale paths) — link to
  // the public homepage, not the auth-gated dashboard.
  return (
    <div className={styles.page}>
      <p className={styles.title}>Page not found</p>
      <p className={styles.body}>
        The page you were looking for doesn&apos;t exist or has been moved.
      </p>
      <Link href="/" className={styles.link}>
        Go to homepage
      </Link>
    </div>
  );
}
