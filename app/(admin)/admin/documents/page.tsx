"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import styles from "../../admin.module.css";
import { SAVED_FEEDBACK_MS } from "@/lib/config/portal";
import { formatDateShort } from "@/lib/utils/format";
import { ADMIN_ROUTES } from "@/lib/config/routes";
import { LoadingState } from "@/components/LoadingState";

type Patient = { id: string; name: string | null; email: string };
type Document = {
  id: string;
  title: string;
  fileUrl: string;
  mimeType: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string };
};

export default function AdminDocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [patientId, setPatientId] = useState("");
  const [title, setTitle] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const loadDocuments = useCallback(async () => {
    const res = await fetch("/api/documents");
    if (!res.ok) throw new Error("Failed to load documents");
    const data = await res.json();
    setDocuments(data.data ?? []);
  }, []);

  const loadPatients = useCallback(async () => {
    const res = await fetch("/api/admin/patients");
    if (!res.ok) throw new Error("Failed to load patients");
    const data = await res.json();
    setPatients(data.data ?? []);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        await Promise.all([loadDocuments(), loadPatients()]);
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [loadDocuments, loadPatients]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: patientId, title, fileUrl }),
      });
      const data = await res.json();
      if (!data.success) {
        setError("Failed to add document.");
        return;
      }
      setPatientId("");
      setTitle("");
      setFileUrl("");
      setSuccess(true);
      setShowForm(false);
      setTimeout(() => setSuccess(false), SAVED_FEEDBACK_MS);
      loadDocuments();
    } catch {
      setError("Failed to add document.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>
            <em>Documents</em>
          </h1>
          <p className={styles.pageSub}>Patient documents and lab results</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className={styles.headerBtn}
        >
          + Add document
        </button>
      </div>

      {success && (
        <div className={styles.successBanner}>Document added successfully.</div>
      )}

      {showForm && (
        <div className={styles.cardMb}>
          <p className={styles.sectionEyebrow}>New document</p>
          <form onSubmit={handleSubmit} className={styles.formStack}>
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="doc-patient">Patient</label>
              <select
                id="doc-patient"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                required
                className={styles.selectInput}
              >
                <option value="">Select patient…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name ? `${p.name} (${p.email})` : p.email}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formGrid2}>
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="doc-title">Title</label>
                <input
                  id="doc-title"
                  className={styles.formInput}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Lab results, Assessment report…"
                  required
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="doc-url">File URL</label>
                <input
                  id="doc-url"
                  className={styles.formInput}
                  type="url"
                  value={fileUrl}
                  onChange={(e) => setFileUrl(e.target.value)}
                  placeholder="https://…"
                  required
                />
              </div>
            </div>
            {error && <p className={styles.formError}>{error}</p>}
            <div className={styles.formRow}>
              <button
                type="submit"
                className={styles.formRowSubmit}
                disabled={submitting}
              >
                {submitting ? "Adding…" : "Add document"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className={styles.cancelBtn}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : loadError ? (
        <div className={styles.emptyState}>Failed to load documents. Please refresh the page.</div>
      ) : documents.length === 0 ? (
        <div className={styles.card}>
          <div className={styles.emptyState}>No documents yet.</div>
        </div>
      ) : (
        <div className={styles.card}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Title</th>
                <th>Type</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <Link href={`${ADMIN_ROUTES.patients}/${doc.user.id}`} className={styles.linkPlain}>
                      <div className={styles.cellName}>
                        {doc.user.name ?? <span className={styles.cellMuted}>No name</span>}
                      </div>
                      <div className={styles.cellSub}>{doc.user.email}</div>
                    </Link>
                  </td>
                  <td className={styles.cellInk2}>{doc.title}</td>
                  <td className={styles.cellSub}>
                    {doc.mimeType ?? "—"}
                  </td>
                  <td className={styles.cellNowrap}>
                    {formatDateShort(doc.createdAt)}
                  </td>
                  <td>
                    <a
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.cellLink}
                    >
                      Open →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
