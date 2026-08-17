import styles from "../../admin.module.css";
import { ClinicianApplicationsQueue } from "@/components/admin/ClinicianApplicationsQueue";
import { MarkSeen } from "@/components/admin/MarkSeen";

export default function AdminApplicationsPage() {
  return (
    <div>
      <MarkSeen navKey="applications" />
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
