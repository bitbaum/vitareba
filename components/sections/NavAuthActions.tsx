"use client";

import type { Session } from "next-auth";
import NextLink from "next/link";
import { Link } from "@/lib/i18n/navigation";
import styles from "./Nav.module.css";
import { PORTAL_ROUTES, AUTH_ROUTES } from "@/lib/config/routes";

/**
 * The logged-in/logged-out nav action block, in ONE place. Nav.tsx used to
 * hand-write this twice — once for the desktop bar, once for the mobile
 * menu — so a future auth-state change needed both edits kept in sync by
 * hand. It had already drifted once: mobile showed the CTA before "Sign in",
 * desktop the reverse; unified to sign-in-first here.
 */
export function NavAuthActions({
  session,
  variant,
  onNavigate,
  labels,
}: {
  session: Session | null;
  variant: "desktop" | "mobile";
  onNavigate?: () => void;
  labels: { dashboard: string; signIn: string; cta: string };
}) {
  if (variant === "mobile") {
    return (
      <div className={styles.mobileMenuActions}>
        {session ? (
          <NextLink
            href={PORTAL_ROUTES.dashboard}
            className={styles.mobileMenuBtn}
            onClick={onNavigate}
          >
            {labels.dashboard} &rarr;
          </NextLink>
        ) : (
          <>
            <Link href={AUTH_ROUTES.login} className={styles.mobileMenuSignIn} onClick={onNavigate}>
              {labels.signIn}
            </Link>
            <a href="?assessment=open" className={styles.mobileMenuBtn} onClick={onNavigate}>
              {labels.cta}
            </a>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      {session ? (
        <NextLink href={PORTAL_ROUTES.dashboard} className={styles.navBtn}>
          {labels.dashboard} &rarr;
        </NextLink>
      ) : (
        <>
          <Link href={AUTH_ROUTES.login} className={styles.navSignIn}>
            {labels.signIn}
          </Link>
          <a href="?assessment=open" className={styles.navBtn}>
            {labels.cta}
          </a>
        </>
      )}
    </>
  );
}
