"use client";

import { Suspense, useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
// Locale-aware router & Link so /de/login → /de/register (not /register)
import { Link, useRouter } from "@/lib/i18n/navigation";
import styles from "../auth.module.css";
import { ADMIN_ROUTES, AUTH_ROUTES, PORTAL_ROUTES } from "@/lib/config/routes";
import { USER_ROLE } from "@/lib/config/auth";
import { sanitizeReturnTo } from "@/lib/domain/auth";

function LoginForm() {
  const t = useTranslations("auth.login");
  const router = useRouter();
  const searchParams = useSearchParams();
  // Sanitize: must be a same-origin relative path. Prevents open-redirect to ?returnTo=https://evil.com.
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"), PORTAL_ROUTES.dashboard);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        setError(t("error"));
        return;
      }
      // Default landing is role-aware: clinicians start their day in the admin
      // panel, patients on the dashboard. An explicit returnTo always wins —
      // the portal stays fully reachable for dual-role users.
      let dest = returnTo;
      if (returnTo === PORTAL_ROUTES.dashboard) {
        const session = await getSession();
        if (session?.user.role === USER_ROLE.admin) dest = ADMIN_ROUTES.patients;
      }
      router.push(dest);
      router.refresh();
    } catch {
      setError(t("error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h2 className={styles.title}>
        {t("title")}
        <br />
        <em>{t("titleEm")}</em>
      </h2>
      <p className={styles.subtitle}>{t("sub")}</p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">
            {t("emailLabel")}
          </label>
          <input
            id="email"
            className={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPlaceholder")}
            required
            autoComplete="email"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">
            {t("passwordLabel")}
          </label>
          <input
            id="password"
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("passwordPlaceholder")}
            required
            autoComplete="current-password"
          />
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <button type="submit" className={styles.submit} disabled={loading}>
          {loading ? t("submitting") : t("submit")}
        </button>
      </form>

      <div className={styles.linkRow}>
        <span>
          {t("noAccount")}{" "}
          <Link
            className={styles.link}
            href={`${AUTH_ROUTES.register}${returnTo !== PORTAL_ROUTES.dashboard ? `?returnTo=${returnTo}` : ""}`}
          >
            {t("registerLink")}
          </Link>
        </span>
        <Link className={styles.link} href={AUTH_ROUTES.forgotPassword}>
          {t("forgotPassword")}
        </Link>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
