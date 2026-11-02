import Link from "next/link";
import { headers } from "next/headers";
import { authLabelsFor, isDeliverable } from "@bitbaum/accountkit/auth";
import { auth } from "@/lib/auth";
import { AccountPanel } from "@/components/auth/AuthForms";
import { vitaMethods } from "@/lib/auth/methods";
import { sharedAuth } from "@/lib/auth/shared/runtime";
import styles from "../portal.module.css";
import profileStyles from "./profile.module.css";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";
import { ProfileForm } from "./ProfileForm";
import { PrivacyCard } from "./PrivacyCard";
import { clinicianLabelFor } from "@/lib/domain/clinician-label";
import { COMPANY } from "@/lib/config/company";
import { PORTAL_ROUTES } from "@/lib/config/routes";

export default async function ProfilePage() {
  const session = await auth();
  const requestHeaders = await headers();
  const [clinician, shared, accounts] = await Promise.all([
    session?.user?.id ? clinicianLabelFor(session.user.id) : COMPANY.clinicianFallback,
    sharedAuth.getSession(),
    sharedAuth
      .getAuth()
      .api.listUserAccounts({ headers: requestHeaders })
      .catch(() => []),
  ]);
  const user = shared?.user as
    (NonNullable<typeof shared>["user"] & { twoFactorEnabled?: boolean | null }) | undefined;

  return (
    <div className={profileStyles.layout}>
      <PortalPageHeader
        title={
          <>
            My <em>Profile</em>
          </>
        }
        subtitle="The more you share, the more tailored your support can be."
      />
      <ProfileForm clinician={clinician} />
      {/* Choosing, switching, messaging and booking a clinician all live on
          one dedicated page now — this used to be its own full picker here,
          which meant the same "who treats me" feature had two homes to keep
          in sync. */}
      <div className={`${styles.card} ${styles.cardGap}`}>
        <p className={styles.cardTitle}>My care team</p>
        <p className={styles.formHint}>
          Currently: {clinician}. Choose a clinician, switch to another, or message and book with
          them directly.
        </p>
        <Link href={PORTAL_ROUTES.careTeam} className={styles.btnSecondary}>
          Manage my care team →
        </Link>
      </div>
      <PrivacyCard />
      {/* How this patient signs in: password, passkeys, a second factor and
          linked sign-ins (AccountKit's panel). Medical records are kept for
          ten years, so the panel's way out is the erasure request above, not
          a delete button. The portal is English. */}
      <section id="account">
        <AccountPanel
          labels={authLabelsFor("en")}
          user={{
            name: user?.name ?? session?.user.name ?? "",
            email: user && isDeliverable(user.email) ? user.email : null,
            emailVerified: Boolean(user?.emailVerified),
            role: session?.user.role ?? "patient",
            twoFactorEnabled: Boolean(user?.twoFactorEnabled),
          }}
          linked={accounts.map((a) => a.providerId)}
          methods={vitaMethods()}
          accountPath={PORTAL_ROUTES.profile}
          homePath={PORTAL_ROUTES.dashboard}
          // The name lives on users and is edited in "Personal" above.
          ownProfile
          deletion={
            <Link href={`${PORTAL_ROUTES.profile}#privacy`} className={styles.btnSecondary}>
              Request account deletion
            </Link>
          }
        />
      </section>
    </div>
  );
}
