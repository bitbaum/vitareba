"use client";

import { useRouter } from "next/navigation";
import styles from "../portal.module.css";
import formStyles from "../../forms.module.css";
import docStyles from "./documents.module.css";
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_FILE_SIZE_MB,
  DOCUMENT_TITLE_MAX_LENGTH,
} from "@/lib/config/portal";
import { useDocumentUpload } from "@/lib/hooks/useDocumentUpload";

/**
 * Patients add their own documents here — lab results, referral letters, a
 * photo of a prescription. The server decides who the document belongs to
 * (always the signed-in user), so this form never sends a patient id: it omits
 * `patientId` from useDocumentUpload, which the clinician's DocumentAddForm
 * passes. The upload itself is the same one.
 */
export function DocumentUploadForm() {
  const router = useRouter();
  const {
    title,
    setTitle,
    progress,
    errorMsg,
    fileRef,
    handleFileChange,
    handleSubmit,
    submitLabel,
    submitDisabled,
    // The list this form sits above is server-rendered, so a new document only
    // appears once the route re-renders.
  } = useDocumentUpload({ onUploaded: () => router.refresh() });

  return (
    <form onSubmit={handleSubmit} className={`${styles.card} ${docStyles.uploadForm}`}>
      <p className={styles.cardTitle}>Add a document</p>
      <p className={docStyles.uploadHint}>
        Lab results, referral letters, prescriptions — your care team can see anything you add here.
      </p>
      <div className={docStyles.uploadGrid}>
        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="doc-title">
            Title
          </label>
          <input
            id="doc-title"
            className={formStyles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Blood panel, referral letter…"
            maxLength={DOCUMENT_TITLE_MAX_LENGTH}
            required
          />
        </div>
        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="doc-file">
            File (max {DOCUMENT_MAX_FILE_SIZE_MB} MB)
          </label>
          <input
            id="doc-file"
            ref={fileRef}
            className={docStyles.fileInput}
            type="file"
            accept={DOCUMENT_ACCEPT}
            onChange={handleFileChange}
            required
          />
        </div>
      </div>
      {progress === "error" && <p className={styles.formError}>{errorMsg}</p>}
      <button
        type="submit"
        className={`${styles.btnPrimary} ${docStyles.uploadSubmit}`}
        disabled={submitDisabled}
      >
        {submitLabel}
      </button>
    </form>
  );
}
