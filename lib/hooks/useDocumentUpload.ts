"use client";

import { useRef, useState } from "react";
import { DOCUMENT_MAX_FILE_SIZE_MB, SAVED_FEEDBACK_MS } from "@/lib/config/portal";

type Progress = "idle" | "uploading" | "done" | "error";

/**
 * Adding a document — one definition, whoever is adding it.
 *
 * A patient uploads their own lab results; a clinician uploads a report onto a
 * patient's record. Two forms, two skins, and until now two copies of the same
 * upload: the size pre-check, the FormData, the `data.success` handling, the
 * "Uploaded ✓" that fades after SAVED_FEEDBACK_MS, the reset of the file input.
 *
 * The pre-check is the part that made this worth doing. Refusing a file larger
 * than DOCUMENT_MAX_FILE_SIZE_MB *before* sending it is what stops a patient on
 * a phone from pushing 40 MB up a mobile connection to be told no; a copy of
 * that rule that quietly went stale would be invisible until someone's upload
 * hung. The server enforces the same limit — this is the courtesy, not the gate.
 *
 * `patientId` is the whole difference between the two callers. The patient form
 * omits it and the server files the document against the signed-in user, which
 * is why a patient cannot upload onto someone else's record by editing a form.
 */
export function useDocumentUpload({
  patientId,
  onUploaded,
}: { patientId?: string; onUploaded?: () => void } = {}) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<Progress>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  /** Rejects an oversized file here, so it is never sent. */
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
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
  }

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
      if (patientId) formData.set("patientId", patientId);

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
      onUploaded?.();
      setTimeout(() => setProgress("idle"), SAVED_FEEDBACK_MS);
    } catch {
      setProgress("error");
      setErrorMsg("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return {
    title,
    setTitle,
    progress,
    errorMsg,
    fileRef,
    handleFileChange,
    handleSubmit,
    /** The button says where the upload got to; both forms said it identically. */
    submitLabel:
      progress === "uploading"
        ? "Uploading…"
        : progress === "done"
          ? "Uploaded ✓"
          : "Upload document",
    submitDisabled: uploading || !file || !title.trim(),
  };
}
