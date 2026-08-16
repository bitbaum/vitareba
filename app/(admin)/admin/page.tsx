import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import styles from "../admin.module.css";
import { loadClinicalInbox } from "@/lib/domain/clinical-inbox-data";
import type { InboxSection, InboxItem } from "@/lib/domain/clinical-inbox";
import { USER_ROLE } from "@/lib/config/auth";
import { ADMIN_ROUTES, PORTAL_ROUTES } from "@/lib/config/routes";
import { formatDateShort } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

/**
 * TODAY — what is waiting for the clinician, before anything else.
 *
 * This route used to redirect straight to the patient list. A list sorted by a
 * badge answers "how is everyone", which is a fine second question; the first
 * one, at 08:00 on a Tuesday, is "what needs me". The product's stated goal is
 * that Manuel opens the admin and knows without calling anyone — a list of every
 * patient, most of whom are fine, is not that.
 *
 * Every judgement on this page is made by buildClinicalInbox, so nothing here
 * decides who is critical. The page's only job is to render the answer in the
 * order it was given.
 */
export default async function AdminTodayPage() {
  const session = await auth();
  if (!session || session.user.role !== USER_ROLE.admin) redirect(PORTAL_ROUTES.dashboard);

  let inbox;
  try {
    inbox = await loadClinicalInbox();
  } catch (err) {
    // A clinician staring at a spinner does not know whether the day is quiet or
    // the page is broken. Say which.
    console.error("[admin/today] inbox failed to load:", err);
    return (
      <div>
        <h1 className={styles.pageTitle}>Today</h1>
        <p className={styles.pageSub}>
          Could not load the inbox. The patient list is still available.
        </p>
        <Link href={ADMIN_ROUTES.patients} className={styles.cardLabel}>
          All patients →
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>
        Today
      </h1>
      <p className={styles.pageSub}>
        {inbox.total === 0
          ? "Nothing is waiting on you."
          : `${inbox.total} ${inbox.total === 1 ? "thing needs" : "things need"} your attention.`}
      </p>

      {inbox.total === 0 ? (
        <div className={`${styles.card} ${styles.inboxClear}`}>
          <p className={styles.inboxClearTitle}>Everyone is accounted for.</p>
          <p className={styles.inboxClearBody}>
            No result outside a range that can wait, no unanswered message, no booking
            unconfirmed, and nobody without a next step.
          </p>
        </div>
      ) : (
        inbox.sections.map((s) => <Section key={s.key} section={s} />)
      )}
    </div>
  );
}

function Section({ section }: { section: InboxSection }) {
  const titleClass =
    section.tone === "urgent"
      ? styles.inboxTitleUrgent
      : section.tone === "attention"
        ? styles.inboxTitleAttention
        : styles.inboxTitleRoutine;

  return (
    <section className={styles.inboxSection}>
      <div className={styles.inboxHeader}>
        <h2 className={titleClass}>{section.label}</h2>
        {section.items.length > 0 && (
          <span className={styles.inboxCount}>
            {section.items.length + section.overflow}
          </span>
        )}
      </div>

      {section.items.length === 0 ? (
        <p className={styles.inboxEmpty}>{section.empty}</p>
      ) : (
        <>
          {section.items.map((item) => (
            <Item key={item.key} item={item} />
          ))}
          {/* Never truncate silently: "8 shown" and "8 in total" must not look
              the same to someone deciding whether they are done for the day. */}
          {section.overflow > 0 && (
            <p className={styles.inboxEmpty}>
              <Link href={ADMIN_ROUTES.patients} className={styles.cardLabel}>
                {section.overflow} more not shown — open the patient list →
              </Link>
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Item({ item }: { item: InboxItem }) {
  return (
    <Link href={`${ADMIN_ROUTES.patients}/${item.patientId}`} className={styles.inboxItem}>
      <span className={styles.inboxPatient}>{item.patientName}</span>
      <span>
        <span className={styles.inboxHeadline}>{item.headline}</span>
        <span className={styles.inboxDetail}>{item.detail}</span>
      </span>
      <span className={styles.inboxWhen}>{formatDateShort(item.since)}</span>
    </Link>
  );
}
