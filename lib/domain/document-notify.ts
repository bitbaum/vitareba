/**
 * DOCUMENT NOTIFICATIONS — who hears about a new document.
 *
 * One rule, shared by both upload routes (multipart + JSON) so they can never
 * drift apart:
 *   - a clinician uploaded FOR a patient  → the patient is told
 *   - the patient uploaded it THEMSELVES  → their care team is told
 *     (falling back to ADMIN_EMAILS when nobody is on their care team yet,
 *     so a patient's lab result never lands in a mailbox nobody reads)
 */

import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { newDocumentEmail, patientDocumentUploadedEmail } from "@/lib/email/templates";
import { PORTAL_URL, COMPANY, getAdminEmails } from "@/lib/config/company";
import { ADMIN_ROUTES, PORTAL_ROUTES } from "@/lib/config/routes";
import { USER_ROLE } from "@/lib/config/auth";
import { getCareTeamIds } from "@/lib/domain/care-team";
import { displayName } from "@/lib/utils/format";
import { createNotification, createNotificationForMany } from "@/lib/domain/notifications";
import { NOTIFICATION_TYPE } from "@/lib/config/notifications";

export async function notifyDocumentAdded({
  patientId,
  uploaderId,
  title,
}: {
  patientId: string;
  uploaderId: string;
  title: string;
}): Promise<void> {
  const patient = await db.query.users.findFirst({
    where: eq(users.id, patientId),
    columns: { name: true, email: true },
  });

  // Someone else added it for the patient → the patient is the one who needs to know.
  if (uploaderId !== patientId) {
    if (!patient?.email) return;
    // Name the person who actually shared it. Any care-team member can upload,
    // so the patient's primary clinician is the wrong answer as often as not.
    const uploader = await db.query.users.findFirst({
      where: eq(users.id, uploaderId),
      columns: { name: true, email: true },
    });
    await sendEmail({
      to: patient.email,
      subject: `New document shared: ${title}`,
      html: newDocumentEmail({
        patientName: displayName(patient.name, patient.email),
        title,
        portalUrl: PORTAL_URL,
        sharedBy: uploader
          ? displayName(uploader.name, uploader.email, COMPANY.clinicianFallback)
          : COMPANY.clinicianFallback,
      }),
    });
    await createNotification({
      userId: patientId,
      type: NOTIFICATION_TYPE.documentUploaded,
      title: `New document shared: ${title}`,
      href: PORTAL_ROUTES.documents,
    });
    return;
  }

  // The patient uploaded their own document → tell whoever is treating them.
  const careTeamIds = await getCareTeamIds(patientId);
  const clinicians = careTeamIds.length
    ? await db.query.users.findMany({
        where: inArray(users.id, careTeamIds),
        columns: { email: true },
      })
    : [];

  const careTeamEmails = clinicians
    .map((c) => c.email)
    .filter((email): email is string => Boolean(email));
  const recipients = careTeamEmails.length > 0 ? careTeamEmails : getAdminEmails();
  const patientLabel = displayName(patient?.name, patient?.email, "A patient");

  if (recipients.length > 0) {
    await sendEmail({
      to: recipients,
      subject: `${patientLabel} uploaded a document: ${title}`,
      html: patientDocumentUploadedEmail({
        patientName: patientLabel,
        title,
        adminUrl: `${PORTAL_URL}${ADMIN_ROUTES.patients}/${patientId}`,
      }),
    });
  }

  // In-app recipients mirror the email fallback: care team, or every admin
  // when nobody is on it yet — but as userIds, since notifications need a FK.
  let recipientIds = careTeamIds;
  if (recipientIds.length === 0) {
    const admins = await db.query.users.findMany({
      where: eq(users.role, USER_ROLE.admin),
      columns: { id: true },
    });
    recipientIds = admins.map((a) => a.id);
  }
  await createNotificationForMany(recipientIds, {
    type: NOTIFICATION_TYPE.documentUploaded,
    title: `${patientLabel} uploaded a document: ${title}`,
    href: `${ADMIN_ROUTES.patients}/${patientId}`,
  });
}
