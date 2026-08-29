import { auth } from "@/lib/auth";
import styles from "../portal.module.css";
import { MeasurementsPanel } from "@/components/clinical/MeasurementsPanel";
import { SafetyNotice } from "@/components/clinical/SafetyNotice";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";
import { PORTAL_ROUTES } from "@/lib/config/routes";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * The patient's own numbers.
 *
 * Two things are deliberately true here and nowhere else in the portal:
 *
 *  1. The patient sees the SAME rendering their clinician sees — same intervals,
 *    same trend arrows, same words. A portal that softens or hides what the
 *    clinical side shows is a portal that teaches patients their record is
 *    something being kept FROM them.
 *
 *  2. They can add their own vitals, and only their own. A home blood pressure
 *    cuff produces better data than a single reading in a consulting room where
 *    the patient is nervous — that is real clinical value, not a toy. Laboratory
 *    results stay read-only, because the record must always say who vouched for
 *    a number. The API enforces both; this page just renders the result.
 */
export default async function LabsPage() {
  const session = await auth();
  if (!session) return null;

  return (
    <div>
      <PortalPageHeader
        title={
          <>
            Labs &amp; <em>Vitals</em>
          </>
        }
        subtitle="Everything measured about you, and which way it is moving. Blood pressure, weight, sleep and anything else you track yourself can be added here — your clinician sees it the moment you save it."
      />

      <MeasurementsPanel />

      <div className={styles.cardGap}>
        <SafetyNotice />
        <p className={styles.pageSub}>
          Have a laboratory report we have not entered yet?{" "}
          <Link href={PORTAL_ROUTES.documents}>Upload it under Documents</Link> or{" "}
          <Link href={PORTAL_ROUTES.messages}>send it in a message</Link> and your clinician will
          add the values so they can be tracked.
        </p>
      </div>
    </div>
  );
}
