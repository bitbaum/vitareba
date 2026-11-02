import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { authLabelsFor } from "@bitbaum/accountkit/auth";
import { Link } from "@/lib/i18n/navigation";
import { SignUpForm } from "@/components/auth/AuthForms";
import { vitaMethods } from "@/lib/auth/methods";
import { landingAfterSignIn } from "@/lib/auth/landing";
import { AUTH_ROUTES } from "@/lib/config/routes";
import styles from "../auth.module.css";
import { AssessmentBanner } from "./AssessmentBanner";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

/** AccountKit's sign-up form: an email and a password, or any other way in offered here. */
export default async function RegisterPage({ params, searchParams }: Props) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth.register");
  const { returnTo } = await searchParams;
  const signInPath = `/${locale}${AUTH_ROUTES.login}`;
  return (
    <>
      <AssessmentBanner
        banner={t("assessmentBanner")}
        sub={t("sub")}
        subAssessment={t("subAssessment")}
        title={
          <h2 className={styles.title}>
            {t("title")}
            <br />
            <em>{t("titleEm")}</em>
          </h2>
        }
      />
      <SignUpForm
        labels={authLabelsFor(locale)}
        methods={vitaMethods()}
        next={landingAfterSignIn(returnTo, signInPath)}
        signUpPath={`/${locale}${AUTH_ROUTES.register}`}
        signInPath={signInPath}
        signInLink={
          <Link
            className={styles.link}
            href={
              returnTo
                ? `${AUTH_ROUTES.login}?returnTo=${encodeURIComponent(returnTo)}`
                : AUTH_ROUTES.login
            }
          >
            {t("signInLink")}
          </Link>
        }
      />
    </>
  );
}
