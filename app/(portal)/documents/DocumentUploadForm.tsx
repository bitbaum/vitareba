"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../portal.module.css";
import formStyles from "../../forms.module.css";
import docStyles from "./documents.module.css";
import { DOCUMENT_MAX_FILE_SIZE_MB, DOCUMENT_TITLE_MAX_LENGTH, SAVED_FEEDBACK_MS } from "@/lib/config/portal";

/**
 * Patients add their own documents here — lab results, referral letters, a
 * photo of a prescription. The server decides who the document belongs to
 * (always the signed-in user), so this form never sends a patient id.
 */
export function DocumentUploadForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title.trim()) return;

    setUploading(true);
    setProgress("uploading");
    setErrorMsg("");

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("title", title.trim());

      const res = await fetch("/api/documents/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!data.success) {
        setProgress("error");
        setErrorMsg(data.error ?? "Upload failed.");
        return;
      }

      setTitle("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setProgress("done");
      router.refresh();
      setTimeout(() => setProgress("idle"), SAVED_FEEDBACK_MS);
    } catch {
      setProgress("error");
      setErrorMsg("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`${styles.card} ${docStyles.uploadForm}`}>
      <p className={styles.cardTitle}>Add a document</p>
      <p className={docStyles.uploadHint}>
        Lab results, referral letters, prescriptions — your care team can see anything you add here.
      </p>
      <div className={docStyles.uploadGrid}>
        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="doc-title">Title</label>
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
          <label className={formStyles.label} htmlFor="doc-file">File (max {DOCUMENT_MAX_FILE_SIZE_MB} MB)</label>
          <input
            id="doc-file"
            ref={fileRef}
            className={docStyles.fileInput}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xlsx,.csv"
            onChange={(e) => {
              const selected = e.target.files?.[0] ?? null;
              if (selected && selected.size > DOCUMENT_MAX_FILE_SIZE_MB * 1024 * 1024) {
                setProgress("error");
                setErrorMsg(`File exceeds the ${DOCUMENT_MAX_FILE_SIZE_MB} MB limit.`);
                e.target.value = "";
                setFile(null);
              } else {
                setProgress("idle");
                setErrorMsg("");
                setFile(selected);
              }
            }}
            required
          />
        </div>
      </div>
      {progress === "error" && <p className={styles.formError}>{errorMsg}</p>}
      <button
        type="submit"
        className={`${styles.btnPrimary} ${docStyles.uploadSubmit}`}
        disabled={uploading || !file || !title.trim()}
      >
        {progress === "uploading" ? "Uploading…" : progress === "done" ? "Uploaded ✓" : "Upload document"}
      </button>
    </form>
  );
}
