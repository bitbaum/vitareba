import styles from "../../admin.module.css";
import { ClinicianApplicationsQueue } from "@/components/admin/ClinicianApplicationsQueue";

export default function AdminApplicationsPage() {
  return (
    <div>
      <h1 className={styles.pageTitle}>
        Clinician <em>Applications</em>
      </h1>
      <p className={styles.pageSub}>
        Every account starts as a patient. Review who has asked to treat patients here, and why.
      </p>
      <ClinicianApplicationsQueue />
    </div>
  );
}
