import { auth } from "@/lib/auth";
import styles from "../portal.module.css";
import { CareTeamPanel } from "./CareTeamPanel";

export default async function CareTeamPage() {
  const session = await auth();

  return (
    <div>
      <h1 className={styles.pageTitle}>
        My <em>Care Team</em>
      </h1>
      <p className={styles.pageSub}>
        Who treats you, and how to reach them. Choose a clinician, switch to
        another, message them directly, or book your next appointment.
      </p>
      <CareTeamPanel selfId={session?.user?.id ?? ""} />
    </div>
  );
}
