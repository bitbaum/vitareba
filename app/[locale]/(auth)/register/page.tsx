"use client";

import { Suspense, useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
// Locale-aware router & Link so /de/register → /de/login (not /register)
import { Link, useRouter } from "@/lib/i18n/navigation";
import styles from "../auth.module.css";
import { AUTH_ROUTES, PORTAL_ROUTES } from "@/lib/config/routes";
import { sanitizeReturnTo } from "@/lib/domain/auth";
import { STORAGE_KEYS, safeSessionGet } from "@/lib/utils/storage";

function RegisterForm() {
  const t = useTranslations("auth.register");
  const router = useRouter();
  const searchParams = useSearchParams();
  // Sanitize: must be a same-origin relative path. Prevents open-redirect to ?returnTo=https://evil.com.
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"), PORTAL_ROUTES.dashboard);
  const [hasAssessment, setHasAssessment] = useState(false);

  useEffect(() => {
    setHasAssessment(!!safeSessionGet(STORAGE_KEYS.pendingAssessment));
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      const res = await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!data.success) {
        setErrors(data.error ?? {});
        setLoading(false);
        return;
      }

      const signInRes = await signIn("credentials", { email, password, redirect: false });
      if (signInRes?.error) {
        router.push(`${AUTH_ROUTES.login}?returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }

      router.push(returnTo);
      router.refresh();
    } catch {
      setErrors({ email: [t("genericError")] });
      setLoading(false);
    }
  }

  return (
    <>
      {hasAssessment && <div className={styles.contextBanner}>{t("assessmentBanner")}</div>}
      <h2 className={styles.title}>
        {t("title")}
        <br />
        <em>{t("titleEm")}</em>
      </h2>
      <p className={styles.subtitle}>{hasAssessment ? t("subAssessment") : t("sub")}</p>

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
            autoFocus
          />
          {errors.email && <p className={styles.error}>{errors.email[0]}</p>}
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
            autoComplete="new-password"
          />
          {errors.password && <p className={styles.error}>{errors.password[0]}</p>}
        </div>
        <button type="submit" className={styles.submit} disabled={loading}>
          {loading ? t("submitting") : t("submit")}
        </button>
      </form>

      <div className={styles.linkRow}>
        <span>
          {t("hasAccount")}{" "}
          <Link
            className={styles.link}
            href={`${AUTH_ROUTES.login}${returnTo !== PORTAL_ROUTES.dashboard ? `?returnTo=${returnTo}` : ""}`}
          >
            {t("signInLink")}
          </Link>
        </span>
      </div>
    </>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
