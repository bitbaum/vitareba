/**
 * HOW TO NAME A PATIENT'S DOCTOR — one answer, used by every email and every
 * portal page that used to say "Manuel".
 *
 * Naming one clinician in config was a second source of truth for something
 * `care_team` already knows. It was also simply wrong: every patient was told
 * the same doctor treats them, which stopped being true the moment the clinic
 * had two. This resolves the real name, and falls back to a neutral term rather
 * than guessing — copy that says "your clinician" is never wrong, whereas copy
 * that names the wrong doctor destroys trust in a clinical product.
 */

import { COMPANY } from "@/lib/config/company";
import { getPrimaryClinicianId, getClinicianById } from "@/lib/domain/care-team";
import { displayName } from "@/lib/utils/format";

/**
 * The patient's primary clinician as a display name, or "your clinician" when
 * nobody treats them yet (a brand-new registration, which is exactly when the
 * welcome sequence fires).
 *
 * Never throws: copy must render even if the lookup fails, so a database blip
 * degrades to the neutral term instead of blanking an email.
 */
export async function clinicianLabelFor(patientId: string): Promise<string> {
  try {
    const clinicianId = await getPrimaryClinicianId(patientId);
    if (!clinicianId) return COMPANY.clinicianFallback;
    const clinician = await getClinicianById(clinicianId);
    if (!clinician) return COMPANY.clinicianFallback;
    return displayName(clinician.name, clinician.email, COMPANY.clinicianFallback);
  } catch (err) {
    console.error("[clinicianLabelFor] lookup failed:", err);
    return COMPANY.clinicianFallback;
  }
}

// `sentenceCase` deliberately lives in lib/utils/format.ts, not here: client
// components need it, and this module imports lib/db.
