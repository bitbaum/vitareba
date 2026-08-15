import { auth } from "@/lib/auth";
import { COMPANY } from "@/lib/config/company";
import { USER_ROLE } from "@/lib/config/auth";
import { ADMIN_ROUTES } from "@/lib/config/routes";
import { getPrimaryClinician, isTreating } from "@/lib/domain/care-team";
import { displayName } from "@/lib/utils/format";
import { CheckinForm } from "./CheckinForm";

/**
 * Thin server shell over the client form. It exists for one reason: everything
 * the page offers AFTER the check-in is addressed to a specific person — book
 * them, message them, ask about the trend they read — and who that person is
 * lives in the database (care_team), not in the bundle.
 *
 * The relationship runs both ways. Two clinicians who treat each other are
 * each other's patient, so the same page that offers "book your clinician"
 * also offers the viewer the record of the patient they treat.
 */
export default async function CheckinPage() {
  const session = await auth();
  if (!session) return null;

  let clinician: { id: string; name: string } | null = null;
  let mutualHref: string | null = null;

  try {
    const primary = await getPrimaryClinician(session.user.id);
    if (primary) {
      clinician = {
        id: primary.id,
        name: displayName(primary.name, primary.email, COMPANY.clinicianFallback),
      };
      // Self-pairs are legal (a clinician walking their own patient path) but
      // "you are also your own clinician" is not worth saying.
      if (primary.id !== session.user.id && session.user.role === USER_ROLE.admin) {
        if (await isTreating(session.user.id, primary.id)) {
          mutualHref = `${ADMIN_ROUTES.patients}/${primary.id}`;
        }
      }
    }
  } catch (err) {
    // Copy must render even if the lookup fails: the page degrades to the
    // neutral term and the generic booking flow, never to a blank screen.
    console.error("[checkin] care-team lookup failed:", err);
  }

  return (
    <CheckinForm
      clinician={clinician?.name ?? COMPANY.clinicianFallback}
      clinicianId={clinician?.id ?? null}
      mutualHref={mutualHref}
    />
  );
}
