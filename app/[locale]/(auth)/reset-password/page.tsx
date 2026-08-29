"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
// Locale-aware router so post-reset push to /login keeps the visitor on /de/login
import { Link, useRouter } from "@/lib/i18n/navigation";
import styles from "../auth.module.css";
import { PASSWORD_MIN_LENGTH } from "@/lib/config/auth";
import { AUTH_ROUTES } from "@/lib/config/routes";

function ResetPasswordForm() {
  const t = useTranslations("auth.resetPassword");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const email = searchParams.get("email") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  // Token failure gets its own recovery path: a "request a new link" action
  const [tokenInvalid, setTokenInvalid] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError(t("mismatchError"));
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, password }),
      });

      const data = await res.json();
      if (!data.success) {
        // Map machine-readable codes to translated messages — never show the
        // API's raw (English) error string on a localized page.
        if (data.code === "invalid_token") {
          setTokenInvalid(true);
          setError(t("expiredError"));
        } else {
          setError(t("genericError"));
        }
        return;
      }

      router.push(`${AUTH_ROUTES.login}?reset=1`);
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  if (!token || !email) {
    return (
      <>
        <h1 className={styles.title}>{t("invalidTitle")}</h1>
        <p className={styles.subtitle}>{t("invalidSub")}</p>
        <div className={styles.linkRow}>
          <Link className={styles.link} href={AUTH_ROUTES.forgotPassword}>
            {t("requestNew")}
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className={styles.title}>{t("title")}</h1>
      <p className={styles.subtitle}>{t("sub")}</p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">
            {t("newPasswordLabel")}
          </label>
          <input
            id="password"
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("newPasswordPlaceholder")}
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="confirm">
            {t("confirmPasswordLabel")}
          </label>
          <input
            id="confirm"
            className={styles.input}
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t("confirmPasswordPlaceholder")}
            required
            autoComplete="new-password"
          />
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
            {tokenInvalid && (
              <>
                {" "}
                <Link className={styles.link} href={AUTH_ROUTES.forgotPassword}>
                  {t("requestNew")}
                </Link>
              </>
            )}
          </p>
        )}
        <button type="submit" className={styles.submit} disabled={loading}>
          {loading ? t("submitting") : t("submit")}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
