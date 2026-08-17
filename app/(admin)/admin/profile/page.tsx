import styles from "../../admin.module.css";
import { ClinicianSettingsForm } from "@/components/admin/ClinicianSettingsForm";
import { AcceptingPatientsToggle } from "@/components/admin/AcceptingPatientsToggle";
import { CalendarSubscribeCard } from "@/components/admin/CalendarSubscribeCard";
import { CalendarSubscriptions } from "@/components/admin/CalendarSubscriptions";

export default function AdminProfilePage() {
  return (
    <div>
      <h1 className={styles.pageTitle}>
        My <em>Profile</em>
      </h1>
      <p className={styles.pageSub}>
        What patients see about you, when you actually work, and which of your real calendars block time here.
      </p>

      <ClinicianSettingsForm />

      <AcceptingPatientsToggle />

      <CalendarSubscribeCard />

      {/* The other direction: your calendar blocking slots here, rather than
          this clinic's appointments appearing in your calendar. */}
      <div className={styles.cardMb}>
        <p className={styles.cardLabel}>Your calendars block slots here</p>
        <CalendarSubscriptions />
      </div>
    </div>
  );
}
