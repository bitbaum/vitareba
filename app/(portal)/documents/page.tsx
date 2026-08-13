import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import styles from "../portal.module.css";
import docStyles from "./documents.module.css";
import { formatDateLong } from "@/lib/utils/format";
import { COMPANY } from "@/lib/config/company";
import Link from "next/link";
import { PORTAL_ROUTES } from "@/lib/config/routes";

function mimeLabel(mimeType: string | null): string | null {
  if (!mimeType) return null;
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  return null;
}

export default async function DocumentsPage() {
  const session = await auth();
  if (!session) return null;

  let docs: (typeof documents.$inferSelect)[];
  try {
    docs = await db.query.documents.findMany({
      where: eq(documents.userId, session.user.id),
      orderBy: [desc(documents.createdAt)],
    });
  } catch {
    return (
      <div>
        <h1 className={styles.pageTitle}>My <em>Documents</em></h1>
        <p className={styles.pageSub}>Couldn&apos;t load your documents right now — please refresh.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>My <em>Documents</em></h1>
      <p className={styles.pageSub}>
        Clinical documents shared by {COMPANY.clinicianName} — lab results, reports, and programme materials.
      </p>

      {docs.length === 0 ? (
        <div className={styles.card}>
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>No documents yet</p>
            <p className={styles.emptyBody}>
              {COMPANY.clinicianName} will share lab results, assessment reports, and programme materials here as your work together progresses.
            </p>
            <Link href={PORTAL_ROUTES.bookings} className={styles.emptyAction}>
              Book a consultation →
            </Link>
          </div>
        </div>
      ) : (
        <div className={styles.docList}>
          {docs.map((doc) => {
            const label = mimeLabel(doc.mimeType);
            return (
              <div key={doc.id} className={`${styles.card} ${docStyles.docItem}`}>
                <div className={docStyles.docInfo}>
                  <p className={docStyles.docTitle}>{doc.title}</p>
                  <p className={styles.docMeta}>
                    {formatDateLong(doc.createdAt)}
                    {label && ` · ${label}`}
                  </p>
                </div>
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.docLink}
                >
                  Open →
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
