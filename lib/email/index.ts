import {
  sendMail,
  isMailConfigured,
  fromAddress as kitFromAddress,
  usesSandboxSender,
} from "@bitbaum/mail-kit";
import { COMPANY, DEFAULT_FROM_EMAIL } from "@/lib/config/company";

/**
 * Transport is @bitbaum/mail-kit — the fleet's one email layer. This module
 * keeps the app's public seam (`sendEmail`, `isEmailConfigured`) and its
 * clinic-specific defaults (reply-to the clinic inbox, DEFAULT_FROM_EMAIL
 * fallback); everything transport-shaped lives in mail-kit.
 */

/** True when the configured sender can only reach the provider account owner. */
export { usesSandboxSender };

/** Whether the email provider is usable at all. Flows that DEPEND on an email
 *  arriving (password reset) must check this and fail loudly instead of
 *  letting a patient wait for an email that will never come.
 *
 *  mail-kit treats a placeholder key, and a sandbox sender in production, as
 *  UNCONFIGURED — the exact guard this module used to implement itself. */
export function isEmailConfigured(): boolean {
  return isMailConfigured();
}

type SendOptions = {
  to: string | string[];
  subject: string;
  html: string;
  /**
   * File attachments. Used for calendar invites (.ics): attaching the event
   * is what lets Gmail / Apple Mail / Outlook offer "add to calendar" without
   * the clinic integrating with any single calendar vendor.
   */
  attachments?: { filename: string; content: string; contentType?: string }[];
  /**
   * Pass from retry-prone paths (the email queue cron) so a retried job
   * cannot double-send — the provider dedupes sends sharing a key for 24h.
   */
  idempotencyKey?: string;
};

export type SendResult = { sent: true } | { sent: false; error: string };

/**
 * Send an email. Never throws — returns an honest result instead (mail-kit's
 * own contract). Callers where delivery matters (email queue, password reset)
 * must check `.sent`.
 */
export async function sendEmail({
  to,
  subject,
  html,
  attachments,
  idempotencyKey,
}: SendOptions): Promise<SendResult> {
  if (!isEmailConfigured()) {
    // Dev/build without key: log so developers see the email content
    console.log(`[email] To: ${JSON.stringify(to)}\nSubject: ${subject}`);
  }
  const result = await sendMail(
    {
      to,
      subject,
      html,
      from: kitFromAddress() ?? DEFAULT_FROM_EMAIL,
      // A clinical email a patient cannot answer is a dead end. Replies go to
      // the clinic inbox rather than an unmonitored noreply@ sender.
      replyTo: COMPANY.email,
      ...(attachments?.length
        ? {
            attachments: attachments.map((a) => ({
              filename: a.filename,
              // App callers pass utf8 text (.ics); mail-kit base64-encodes
              // bytes but treats a string as ALREADY base64 — hand it bytes.
              content: Buffer.from(a.content, "utf8"),
              contentType: a.contentType,
            })),
          }
        : {}),
    },
    idempotencyKey ? { idempotencyKey } : {},
  );
  if (!result.sent) {
    console.error("[email] send failed:", result.error);
    return { sent: false, error: result.error };
  }
  return { sent: true };
}
