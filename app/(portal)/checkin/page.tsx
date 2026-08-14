import { auth } from "@/lib/auth";
import { clinicianLabelFor } from "@/lib/domain/clinician-label";
import { CheckinForm } from "./CheckinForm";

/**
 * Thin server shell over the client form. It exists for one reason: the copy
 * tells the patient who reads their trend, and that answer lives in the
 * database (care_team), not in the bundle.
 */
export default async function CheckinPage() {
  const session = await auth();
  if (!session) return null;

  return <CheckinForm clinician={await clinicianLabelFor(session.user.id)} />;
}
