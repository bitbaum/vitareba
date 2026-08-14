import { auth } from "@/lib/auth";
import styles from "../portal.module.css";
import profileStyles from "./profile.module.css";
import { ProfileForm } from "./ProfileForm";
import { PasswordForm } from "./PasswordForm";
import { PrivacyCard } from "./PrivacyCard";
import { CareTeamCard } from "./CareTeamCard";
import { clinicianLabelFor } from "@/lib/domain/clinician-label";
import { COMPANY } from "@/lib/config/company";

export default async function ProfilePage() {
  const session = await auth();
  const clinician = session?.user?.id
    ? await clinicianLabelFor(session.user.id)
    : COMPANY.clinicianFallback;

  return (
    <div className={profileStyles.layout}>
      <div>
        <h1 className={styles.pageTitle}>
          My <em>Profile</em>
        </h1>
        <p className={styles.pageSub}>
          The more you share, the more tailored your support can be.
        </p>
      </div>
      <ProfileForm clinician={clinician} />
      <CareTeamCard selfId={session?.user?.id ?? ""} />
      <PrivacyCard />
      <PasswordForm />
    </div>
  );
}
