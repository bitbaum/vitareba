import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { authLabelsFor } from "@bitbaum/accountkit/auth";
import { Link } from "@/lib/i18n/navigation";
import { SignInForm } from "@/components/auth/AuthForms";
import { vitaMethods } from "@/lib/auth/methods";
import { landingAfterSignIn } from "@/lib/auth/landing";
import { AUTH_ROUTES } from "@/lib/config/routes";
import styles from "../auth.module.css";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; returnTo?: string }>;
};

/** AccountKit's sign-in form, with every method this deployment offers. */
export default async function LoginPage({ params, searchParams }: Props) {
  // Which methods are offered is the box's env, read per request.
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth.login");
  const { error, returnTo } = await searchParams;
  const signInPath = `/${locale}${AUTH_ROUTES.login}`;
  // The link to sign-up says AccountKit's own words, as on every fleet app.
  const labels = authLabelsFor(locale);
  return (
    <>
      <h2 className={styles.title}>
        {t("title")}
        <br />
        <em>{t("titleEm")}</em>
      </h2>
      <p className={styles.subtitle}>{t("sub")}</p>
      <SignInForm
        labels={labels}
        methods={vitaMethods()}
        next={landingAfterSignIn(returnTo, signInPath)}
        signInPath={signInPath}
        initialError={Boolean(error)}
        signUpLink={
          <Link
            className={styles.link}
            href={
              returnTo
                ? `${AUTH_ROUTES.register}?returnTo=${encodeURIComponent(returnTo)}`
                : AUTH_ROUTES.register
            }
          >
            {labels.createAccount}
          </Link>
        }
      />
    </>
  );
}
