"use client";

import styles from "@/app/(admin)/admin.module.css";
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_FILE_SIZE_MB,
  DOCUMENT_TITLE_MAX_LENGTH,
} from "@/lib/config/portal";
import { useDocumentUpload } from "@/lib/hooks/useDocumentUpload";

/**
 * A clinician adding a document onto a patient's record. The upload itself is
 * shared with the patient's own upload form — see lib/hooks/useDocumentUpload.ts;
 * `patientId` is the whole difference.
 */
export function DocumentAddForm({ patientId }: { patientId: string }) {
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
  } = useDocumentUpload({ patientId });

  return (
    <form onSubmit={handleSubmit} className={styles.docForm}>
      <p className={styles.docFormHeading}>Add document</p>
      <div className={styles.formGrid2}>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="doc-title">
            Title
          </label>
          <input
            id="doc-title"
            className={styles.formInput}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Lab results, Assessment report…"
            maxLength={DOCUMENT_TITLE_MAX_LENGTH}
            required
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="doc-file">
            File (max {DOCUMENT_MAX_FILE_SIZE_MB} MB)
          </label>
          <input
            id="doc-file"
            ref={fileRef}
            className={styles.docFileInput}
            type="file"
            accept={DOCUMENT_ACCEPT}
            onChange={handleFileChange}
            required
          />
        </div>
      </div>
      {progress === "error" && <p className={styles.assignError}>{errorMsg}</p>}
      <button type="submit" className={styles.assignSubmit} disabled={submitDisabled}>
        {submitLabel}
      </button>
    </form>
  );
}
