import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { authLabelsFor } from "@bitbaum/accountkit/auth";
import { Link } from "@/lib/i18n/navigation";
import { vitaMethods } from "@/lib/auth/methods";
import { AUTH_ROUTES } from "@/lib/config/routes";
import { COMPANY } from "@/lib/config/company";
import styles from "../auth.module.css";
import { RecoveryScreen } from "./RecoveryScreen";

type Props = { params: Promise<{ locale: string }> };

/**
 * "Forgot your password?": AccountKit's recovery form. The mailed link lands
 * on the sign-in page, which sets the new password. Without account mail the
 * page says whom to write to, and every other way in is one tap away.
 */
export default async function ForgotPasswordPage({ params }: Props) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth.forgotPassword");
  const methods = vitaMethods();
  const signInPath = `/${locale}${AUTH_ROUTES.login}`;
  return (
    <>
      <h2 className={styles.title}>{t("title")}</h2>
      <p className={styles.subtitle}>{t("sub")}</p>
      {methods.passwordReset ? (
        <RecoveryScreen
          labels={authLabelsFor(locale)}
          methods={methods}
          next={signInPath}
          signInPath={signInPath}
        />
      ) : (
        <p role="status" className={styles.error}>
          {t("unavailable", { email: COMPANY.email })}
        </p>
      )}
      <div className={styles.linkRow}>
        <Link className={styles.link} href={AUTH_ROUTES.login}>
          {t("backToSignIn")}
        </Link>
      </div>
    </>
  );
}
