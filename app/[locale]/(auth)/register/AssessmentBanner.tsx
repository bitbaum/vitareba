"use client";

import { useEffect, useState, type ReactNode } from "react";
import { STORAGE_KEYS, safeSessionGet } from "@/lib/utils/storage";
import styles from "../auth.module.css";

/**
 * Someone arriving from the self-assessment is told their result is kept: it
 * waits in session storage and is saved once they have an account.
 */
export function AssessmentBanner(props: {
  banner: string;
  sub: string;
  subAssessment: string;
  title: ReactNode;
}) {
  const [hasAssessment, setHasAssessment] = useState(false);
  useEffect(() => {
    setHasAssessment(!!safeSessionGet(STORAGE_KEYS.pendingAssessment));
  }, []);
  return (
    <>
      {hasAssessment && <div className={styles.contextBanner}>{props.banner}</div>}
      {props.title}
      <p className={styles.subtitle}>{hasAssessment ? props.subAssessment : props.sub}</p>
    </>
  );
}
