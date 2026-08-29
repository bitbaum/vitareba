import Link from "next/link";
import styles from "@/app/(admin)/admin.module.css";
import { InlineMessageCompose } from "./InlineMessageCompose";
import { ADMIN_ROUTES } from "@/lib/config/routes";

type Thread = {
  id: string;
  subject: string;
  // senderId is null when the sender's account was deleted — the message text
  // survives in the patient's record without an author.
  messages: { body: string; senderId: string | null; readAt: Date | string | null }[];
};

export function PatientMessagesCard({
  threads,
  patientId,
}: {
  threads: Thread[];
  patientId: string;
}) {
  return (
    <div className={styles.card}>
      <p className={styles.cardLabel}>Messages ({threads.length})</p>
      {threads.length === 0 ? (
        <div className={styles.emptyState}>No messages.</div>
      ) : (
        <div className={styles.msgThreadList}>
          {threads.map((t) => {
            const lastMsg = t.messages[0];
            // Unread = patient sent the last message and admin hasn't read it yet
            const isUnread = !!lastMsg && lastMsg.senderId === patientId && lastMsg.readAt === null;
            return (
              <Link
                key={t.id}
                href={`${ADMIN_ROUTES.messages}/${t.id}`}
                className={styles.msgThreadRow}
              >
                <div>
                  <div className={styles.msgThreadSubjectRow}>
                    {isUnread && (
                      <span
                        className={styles.unreadDot}
                        role="img"
                        aria-label="Unread message from patient"
                      />
                    )}
                    <span
                      className={`${styles.msgThreadSubject}${isUnread ? ` ${styles.unreadSubject}` : ""}`}
                    >
                      {t.subject}
                    </span>
                  </div>
                  {lastMsg && <div className={styles.msgThreadPreview}>{lastMsg.body}</div>}
                </div>
                <span className={styles.msgThreadViewLink}>View →</span>
              </Link>
            );
          })}
        </div>
      )}
      <InlineMessageCompose patientId={patientId} />
    </div>
  );
}
