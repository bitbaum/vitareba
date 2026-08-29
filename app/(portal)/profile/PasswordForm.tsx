"use client";

import { useState } from "react";
import styles from "../portal.module.css";
import profileStyles from "./profile.module.css";
import authStyles from "../../forms.module.css";
import { SAVED_FEEDBACK_MS, SAVING_LABEL, SAVED_LABEL } from "@/lib/config/portal";
import { PASSWORD_MIN_LENGTH } from "@/lib/config/auth";

export function PasswordForm() {
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState("");

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwSaving(true);
    setPwError("");
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pwForm),
      });
      const data = await res.json();
      if (!data.success) {
        setPwError(data.error ?? "Failed to change password.");
        return;
      }
      setPwForm({ currentPassword: "", newPassword: "" });
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), SAVED_FEEDBACK_MS);
    } catch {
      setPwError("Failed to change password. Please try again.");
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className={`${styles.card} ${profileStyles.pwFormCard}`}>
      <p className={styles.cardTitle}>Change password</p>
      <form onSubmit={handlePasswordChange} className={profileStyles.pwForm}>
        <div className={authStyles.field}>
          <label className={authStyles.label} htmlFor="currentPassword">
            Current password
          </label>
          <input
            id="currentPassword"
            type="password"
            className={authStyles.input}
            value={pwForm.currentPassword}
            onChange={(e) => setPwForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
            autoComplete="current-password"
          />
        </div>
        <div className={authStyles.field}>
          <label className={authStyles.label} htmlFor="newPassword">
            New password
          </label>
          <input
            id="newPassword"
            type="password"
            className={authStyles.input}
            value={pwForm.newPassword}
            onChange={(e) => setPwForm((prev) => ({ ...prev, newPassword: e.target.value }))}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
          />
        </div>
        {pwError && <p className={styles.formError}>{pwError}</p>}
        <button
          type="submit"
          className={`${styles.btnPrimary} ${profileStyles.pwSubmitBtn}`}
          disabled={pwSaving || !pwForm.currentPassword || !pwForm.newPassword}
        >
          {pwSaving ? SAVING_LABEL : pwSaved ? SAVED_LABEL : "Update password"}
        </button>
      </form>
    </div>
  );
}
