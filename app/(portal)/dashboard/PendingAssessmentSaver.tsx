"use client";

// Checks sessionStorage for assessment scores saved during the guest overlay flow.
// If found, POSTs them to /api/assessment and refreshes the page so the dashboard
// immediately shows the user's results without asking them to retake the assessment.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PORTAL_ROUTES } from "@/lib/config/routes";
import { STORAGE_KEYS, safeSessionGet, safeSessionRemove } from "@/lib/utils/storage";

export function PendingAssessmentSaver() {
  const router = useRouter();

  useEffect(() => {
    const pending = safeSessionGet(STORAGE_KEYS.pendingAssessment);
    if (!pending) return;

    try {
      const { scores, overallScore } = JSON.parse(pending) as {
        scores: Record<string, number>;
        overallScore: number;
      };

      // Mark the anonymous lead as converted (fire-and-forget — non-critical)
      const leadId = safeSessionGet(STORAGE_KEYS.pendingLeadId);
      if (leadId) {
        fetch("/api/assessment-leads/convert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId }),
        }).catch(() => {});
        safeSessionRemove(STORAGE_KEYS.pendingLeadId);
      }

      fetch("/api/assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores, overallScore }),
      })
        .then((res) => {
          // Only clear pendingAssessment on success or on a permanent error
          // (4xx — validation/auth failure, retry won't help). Keep it on 5xx
          // so the patient gets another shot on the next dashboard load
          // instead of silently losing their guest-overlay scores to a
          // transient backend hiccup.
          if (res.ok || (res.status >= 400 && res.status < 500)) {
            safeSessionRemove(STORAGE_KEYS.pendingAssessment);
          }
          if (res.ok) {
            // Navigate to assessments page so user sees their saved results
            router.push(`${PORTAL_ROUTES.assessments}?saved=1`);
          }
        })
        .catch(() => {
          // Network error — keep the pending data so it can retry on next load.
        });
    } catch {
      safeSessionRemove(STORAGE_KEYS.pendingAssessment);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
