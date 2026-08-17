import styles from "../../admin.module.css";
import { ClinicianManager } from "@/components/admin/ClinicianManager";

export default function AdminCliniciansPage() {
  return (
    <div>
      <h1 className={styles.pageTitle}>
        <em>Clinicians</em>
      </h1>
      <p className={styles.pageSub}>
        Every account starts as a patient. Add someone directly, by email, to give them a
        clinician&apos;s tools — there is no public way to apply.
      </p>
      <ClinicianManager />
    </div>
  );
}
