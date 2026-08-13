"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import styles from "../auth.module.css";
import { AUTH_ROUTES } from "@/lib/config/routes";
import { COMPANY } from "@/lib/config/company";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgotPassword");

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setUnavailable(false);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // 503 = provider down for EVERYONE (uniform, no enumeration signal) —
      // telling the patient "check your inbox" here would strand them.
      if (res.status === 503) {
        setUnavailable(true);
        return;
      }
      setSent(true);
    } catch {
      // Network error: still show "sent" — prevents email enumeration
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <>
        <h1 className={styles.title}>{t("successTitle")}</h1>
        <p className={styles.subtitle}>
          {t("successSub", { email })}
        </p>
        <div className={styles.linkRow}>
          <Link className={styles.link} href={AUTH_ROUTES.login}>{t("backToSignIn")}</Link>
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
          <label className={styles.label} htmlFor="email">{t("emailLabel")}</label>
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
        {unavailable && (
          <p className={styles.error} role="alert">
            {t("unavailable", { email: COMPANY.email })}
          </p>
        )}
        <button type="submit" className={styles.submit} disabled={loading}>
          {loading ? t("submitting") : t("submit")}
        </button>
      </form>

      <div className={styles.linkRow}>
        <Link className={styles.link} href={AUTH_ROUTES.login}>{t("backToSignIn")}</Link>
      </div>
    </>
  );
}
