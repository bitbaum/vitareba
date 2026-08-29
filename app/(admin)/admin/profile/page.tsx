import styles from "../../admin.module.css";
import { SectionTabs } from "@/components/admin/SectionTabs";
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
        What patients see about you, when you actually work, and which of your real calendars block
        time here.
      </p>

      {/* Was five stacked cards in one unbroken scroll — one screen at a time
          instead: what patients see and when you work, then the separate
          concern of which calendar blocks time here. */}
      <SectionTabs
        ariaLabel="Profile sections"
        sections={[
          {
            id: "settings",
            label: "Profile & hours",
            content: (
              <>
                <ClinicianSettingsForm />
                <AcceptingPatientsToggle />
              </>
            ),
          },
          {
            id: "calendar",
            label: "Calendar sync",
            content: (
              <>
                <CalendarSubscribeCard />
                {/* The other direction: your calendar blocking slots here,
                    rather than this clinic's appointments appearing in yours. */}
                <div className={styles.cardMb}>
                  <p className={styles.cardLabel}>Your calendars block slots here</p>
                  <CalendarSubscriptions />
                </div>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
