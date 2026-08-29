import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import styles from "../portal.module.css";
import docStyles from "./documents.module.css";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";
import { formatDateLong, displayName } from "@/lib/utils/format";
import { documentFileUrl } from "@/lib/config/routes";
import { DocumentUploadForm } from "./DocumentUploadForm";

function mimeLabel(mimeType: string | null): string | null {
  if (!mimeType) return null;
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  return null;
}

type DocumentWithUploader = typeof documents.$inferSelect & {
  uploadedByUser: { name: string | null; email: string | null } | null;
};

export default async function DocumentsPage() {
  const session = await auth();
  if (!session) return null;

  let docs: DocumentWithUploader[] = [];
  let loadError = false;
  try {
    docs = await db.query.documents.findMany({
      where: eq(documents.userId, session.user.id),
      orderBy: [desc(documents.createdAt)],
      with: { uploadedByUser: { columns: { name: true, email: true } } },
    });
  } catch {
    loadError = true;
  }

  return (
    <div>
      <PortalPageHeader
        title={
          <>
            My <em>Documents</em>
          </>
        }
        subtitle="Everything on file for your care — lab results, reports and programme materials shared by your care team, plus anything you add yourself."
      />

      {loadError ? (
        <div className={styles.card}>
          <div className={styles.emptyState}>
            Couldn&apos;t load your documents right now — please refresh.
          </div>
        </div>
      ) : (
        <>
          <DocumentUploadForm />

          {docs.length === 0 ? (
            <div className={styles.card}>
              <div className={styles.emptyState}>
                <p className={styles.emptyTitle}>No documents yet</p>
                <p className={styles.emptyBody}>
                  Your care team will share lab results, assessment reports and programme materials
                  here. You can also add your own — a lab result from elsewhere, a referral letter,
                  a photo of a prescription.
                </p>
              </div>
            </div>
          ) : (
            <div className={styles.docList}>
              {docs.map((doc) => {
                const label = mimeLabel(doc.mimeType);
                const source =
                  doc.uploadedBy === session.user.id
                    ? "Uploaded by you"
                    : `Shared by ${displayName(doc.uploadedByUser?.name, doc.uploadedByUser?.email, "your care team")}`;
                return (
                  <div key={doc.id} className={`${styles.card} ${docStyles.docItem}`}>
                    <div className={docStyles.docInfo}>
                      <p className={docStyles.docTitle}>{doc.title}</p>
                      <p className={styles.docMeta}>
                        <span className={docStyles.docSource}>{source}</span>
                        {" · "}
                        {formatDateLong(doc.createdAt)}
                        {label && ` · ${label}`}
                      </p>
                    </div>
                    <a
                      href={documentFileUrl(doc.id)}
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
        </>
      )}
    </div>
  );
}
