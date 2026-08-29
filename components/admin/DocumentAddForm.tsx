"use client";

import { useRef, useState } from "react";
import styles from "@/app/(admin)/admin.module.css";
import {
  DOCUMENT_MAX_FILE_SIZE_MB,
  DOCUMENT_TITLE_MAX_LENGTH,
  SAVED_FEEDBACK_MS,
} from "@/lib/config/portal";

export function DocumentAddForm({ patientId }: { patientId: string }) {
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
      formData.set("patientId", patientId);

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
      setTimeout(() => setProgress("idle"), SAVED_FEEDBACK_MS);
    } catch {
      setProgress("error");
      setErrorMsg("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

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
      {progress === "error" && <p className={styles.assignError}>{errorMsg}</p>}
      <button
        type="submit"
        className={styles.assignSubmit}
        disabled={uploading || !file || !title.trim()}
      >
        {progress === "uploading"
          ? "Uploading…"
          : progress === "done"
            ? "Uploaded ✓"
            : "Upload document"}
      </button>
    </form>
  );
}
