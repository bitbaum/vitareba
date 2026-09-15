"use client";

import type { InputHTMLAttributes } from "react";
import styles from "./auth.module.css";

/**
 * The auth shell's two repeated pieces, defined once.
 *
 * Sign in, register, forgot password and reset password are four pages of
 * essentially one form, and each had written out its own label/input/error
 * block — seven copies of the same six lines — and its own submit button.
 *
 * The block is small, which is exactly why it drifted: it is the kind of thing
 * you copy without reading. `htmlFor`/`id` pairing, the error paragraph after
 * the input rather than before it, and the disabled-while-submitting button are
 * accessibility and double-submit guarantees, and they should hold on all four
 * pages because they are one component, not because four pages remembered.
 *
 * These are the only pages a patient meets before they have an account, so
 * "it looks slightly different on the reset page" is a trust problem, not a
 * cosmetic one.
 */
export function AuthField({
  id,
  label,
  error,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; error?: string }) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input id={id} className={styles.input} {...input} />
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

/**
 * Submit. `loading` both relabels it and disables it — the two must never come
 * apart, or a patient double-taps and registers twice.
 */
export function AuthSubmit({
  loading,
  label,
  submittingLabel,
}: {
  loading: boolean;
  label: string;
  submittingLabel: string;
}) {
  return (
    <button type="submit" className={styles.submit} disabled={loading}>
      {loading ? submittingLabel : label}
    </button>
  );
}
