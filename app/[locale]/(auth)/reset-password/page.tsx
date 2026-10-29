"use client";

import "@bitbaum/accountkit/styles.css";
import { PasswordField } from "@bitbaum/accountkit/auth/password-field";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
// Locale-aware router so post-reset push to /login keeps the visitor on /de/login
import { Link, useRouter } from "@/lib/i18n/navigation";
import styles from "../auth.module.css";
import { AUTH_ROUTES } from "@/lib/config/routes";

function ResetPasswordForm() {
  const t = useTranslations("auth.resetPassword");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const email = searchParams.get("email") ?? "";

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  // Token failure gets its own recovery path: a "request a new link" action
  const [tokenInvalid, setTokenInvalid] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
          <PasswordField
            id="password"
            classes={{ input: styles.input }}
            value={password}
            onChange={setPassword}
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
