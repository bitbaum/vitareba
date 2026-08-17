import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { newMessageEmail } from "@/lib/email/templates";
import { COMPANY, PORTAL_URL } from "@/lib/config/company";
import { PORTAL_ROUTES, ADMIN_ROUTES } from "@/lib/config/routes";
import { USER_ROLE } from "@/lib/config/auth";
import { displayName } from "@/lib/utils/format";
import { loadThread } from "@/lib/domain/messages";
import { createNotification } from "@/lib/domain/notifications";
import { NOTIFICATION_TYPE } from "@/lib/config/notifications";

/**
 * Tell everyone else in the thread that something was said.
 *
 * The previous version branched on role — patient writes, email the clinic;
 * clinician writes, email the patient. That branch has no answer for a third
 * participant and silently dropped them, which for a clinical conversation
 * means somebody never learns they were asked a question.
 *
 * AI and system participants are skipped: they have no mailbox, by design.
 */
export async function notifyThreadParticipants(
  threadId: string,
  authorId: string
): Promise<void> {
  const loaded = await loadThread(threadId);
  if (!loaded) return;

  const recipients = loaded.thread.participants.filter(
    (p) => p.actorId !== authorId && p.kind === "human" && !p.leftAt
  );
  if (recipients.length === 0) return;

  const [people, author] = await Promise.all([
    db.query.users.findMany({
      where: inArray(
        users.id,
        recipients.map((p) => p.actorId)
      ),
      columns: { id: true, name: true, email: true, role: true },
    }),
    db.query.users.findFirst({
      where: eq(users.id, authorId),
      columns: { name: true, email: true },
    }),
  ]);

  const subject = loaded.thread.subject ?? "";
  const senderName = displayName(author?.name, author?.email);

  await Promise.all([
    ...people
      .filter((p) => Boolean(p.email))
      .map((p) =>
        sendEmail({
          to: p.email,
          subject: `New message: ${subject} — ${COMPANY.shortName}`,
          html: newMessageEmail({
            recipientName: displayName(p.name, p.email),
            senderName,
            subject,
            portalUrl: `${PORTAL_URL}${PORTAL_ROUTES.messages}/${threadId}`,
          }),
        })
      ),
    ...people.map((p) =>
      createNotification({
        userId: p.id,
        type: NOTIFICATION_TYPE.newMessage,
        title: `New message from ${senderName}`,
        body: subject || undefined,
        href: `${p.role === USER_ROLE.admin ? ADMIN_ROUTES.messages : PORTAL_ROUTES.messages}/${threadId}`,
      })
    ),
  ]);
}
