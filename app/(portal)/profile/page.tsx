import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import styles from "../portal.module.css";
import profileStyles from "./profile.module.css";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";
import { ProfileForm } from "./ProfileForm";
import { PasswordForm } from "./PasswordForm";
import { PrivacyCard } from "./PrivacyCard";
import { ClinicianApplicationCard } from "./ClinicianApplicationCard";
import { clinicianLabelFor } from "@/lib/domain/clinician-label";
import { COMPANY } from "@/lib/config/company";
import { PORTAL_ROUTES } from "@/lib/config/routes";

export default async function ProfilePage() {
  const session = await auth();
  const [clinician, dbUser] = await Promise.all([
    session?.user?.id ? clinicianLabelFor(session.user.id) : Promise.resolve(COMPANY.clinicianFallback),
    session?.user?.id
      ? db.query.users.findFirst({ where: eq(users.id, session.user.id), columns: { isClinician: true } })
      : Promise.resolve(undefined),
  ]);

  return (
    <div className={profileStyles.layout}>
      <PortalPageHeader
        title={<>My <em>Profile</em></>}
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
          Currently: {clinician}. Choose a clinician, switch to another, or
          message and book with them directly.
        </p>
        <Link href={PORTAL_ROUTES.careTeam} className={styles.btnSecondary}>
          Manage my care team →
        </Link>
      </div>
      <ClinicianApplicationCard isClinician={dbUser?.isClinician ?? false} />
      <PrivacyCard />
      <PasswordForm />
    </div>
  );
}
