import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { threads, threadMessages } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";
import styles from "../../admin.module.css";
import { formatDateShort } from "@/lib/utils/format";
import { getAdminUnreadThreadIds } from "@/lib/domain/messages";
import { USER_ROLE } from "@/lib/config/auth";
import { PORTAL_ROUTES, ADMIN_ROUTES } from "@/lib/config/routes";

export default async function AdminMessagesPage() {
  const session = await auth();
  if (!session || session.user.role !== USER_ROLE.admin) redirect(PORTAL_ROUTES.dashboard);

  const [allThreads, unreadIds] = await Promise.all([
    db.query.threads.findMany({
      orderBy: [desc(threads.lastMessageAt)],
      with: {
        patient: { columns: { id: true, name: true, email: true } },
        messages: { orderBy: [desc(threadMessages.createdAt)], limit: 1 },
      },
    }),
    getAdminUnreadThreadIds(),
  ]);

  const unreadCount = unreadIds.size;

  // Unread threads first — they are the reason the clinician opened this page.
  // Stable sort keeps newest-first ordering within each group.
  allThreads.sort(
    (a, b) => Number(unreadIds.has(b.id)) - Number(unreadIds.has(a.id))
  );

  return (
    <div>
      <h1 className={styles.pageTitle}>
        <em>Messages</em>
      </h1>
      <p className={styles.pageSub}>
        {allThreads.length} thread{allThreads.length !== 1 ? "s" : ""}
        {unreadCount > 0 && ` · ${unreadCount} unread`}
      </p>

      {allThreads.length === 0 ? (
        <div className={styles.card}>
          <div className={styles.emptyState}>No message threads yet.</div>
        </div>
      ) : (
        <div className={styles.card}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th></th>
                <th>Patient</th>
                <th>Subject</th>
                <th>Last message</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {allThreads.map((t) => {
                const isUnread = unreadIds.has(t.id);
                return (
                  <tr key={t.id} className={styles.clickableRow}>
                    <td className={styles.tdDot}>
                      {isUnread && <span className={styles.unreadDot} role="img" aria-label="Unread message from patient" />}
                    </td>
                    <td>
                      <div className={`${styles.cellName}${isUnread ? ` ${styles.unreadSubject}` : ""}`}>
                        {t.patient.name ?? <span className={styles.cellMuted}>No name</span>}
                      </div>
                      <div className={styles.cellSub}>{t.patient.email}</div>
                    </td>
                    <td className={isUnread ? styles.unreadSubject : undefined}>
                      {t.subject}
                    </td>
                    <td className={styles.tdMaxW}>
                      {t.messages[0] ? (
                        <span className={styles.msgPreview}>{t.messages[0].body}</span>
                      ) : (
                        <span className={styles.cellFaint}>—</span>
                      )}
                    </td>
                    <td className={styles.cellNowrap}>
                      {formatDateShort(t.lastMessageAt)}
                    </td>
                    <td>
                      <Link href={`${ADMIN_ROUTES.messages}/${t.id}`} className={`${styles.cellLink} ${styles.stretchedLink}`}>
                        {isUnread ? "Reply →" : "Open →"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
