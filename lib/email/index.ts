import { Resend } from "resend";
import { COMPANY, DEFAULT_FROM_EMAIL } from "@/lib/config/company";

// Lazy client — only instantiated when RESEND_API_KEY is present at call time
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

/**
 * Resend's shared sandbox sender domain. Mail sent from it reaches ONLY the
 * Resend account owner's own address — every other recipient is rejected by
 * the API. It is fine for local development and catastrophic in production,
 * where it means no patient ever receives a password reset.
 */
const SANDBOX_SENDER_DOMAIN = "resend.dev";

// Read at call time, not at module load, so the guard reflects the real
// runtime env (and stays testable).
function fromAddress(): string {
  return process.env.RESEND_FROM ?? DEFAULT_FROM_EMAIL;
}

/** True when the configured sender can only reach the provider account owner. */
export function usesSandboxSender(from: string = fromAddress()): boolean {
  return from.toLowerCase().includes(`@${SANDBOX_SENDER_DOMAIN}`);
}

/** Whether the email provider is usable at all. Flows that DEPEND on an email
 *  arriving (password reset) must check this and fail loudly instead of
 *  letting a patient wait for an email that will never come.
 *
 *  A sandbox sender counts as UNCONFIGURED in production. It looks configured
 *  — the key is set, the API returns no transport error — but delivers to
 *  nobody, so treating it as working is what turns "check your inbox" into a
 *  silent lockout. This shipped to production once; the guard ends the class. */
export function isEmailConfigured(): boolean {
  if (!process.env.RESEND_API_KEY) return false;
  if (process.env.NODE_ENV === "production" && usesSandboxSender()) return false;
  return true;
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
};

export type SendResult = { sent: true } | { sent: false; error: string };

/**
 * Send an email. Never throws — returns an honest result instead.
 * The Resend SDK reports API failures via its return value, not exceptions,
 * so ignoring the result means "sent" can silently be a lie. Callers where
 * delivery matters (email queue, password reset) must check `.sent`.
 */
export async function sendEmail({ to, subject, html, attachments }: SendOptions): Promise<SendResult> {
  if (!isEmailConfigured()) {
    // Dev/build without key: log so developers see the email content
    console.log(`[email] To: ${JSON.stringify(to)}\nSubject: ${subject}`);
    const reason = process.env.RESEND_API_KEY
      ? `sender ${fromAddress()} is a ${SANDBOX_SENDER_DOMAIN} sandbox address and reaches no patient`
      : "RESEND_API_KEY not configured";
    return { sent: false, error: reason };
  }
  try {
    const { error } = await getResend().emails.send({
      from: fromAddress(),
      // A clinical email a patient cannot answer is a dead end. Replies go to
      // the clinic inbox rather than an unmonitored noreply@ sender.
      replyTo: COMPANY.email,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(attachments?.length
        ? {
            attachments: attachments.map((a) => ({
              filename: a.filename,
              content: Buffer.from(a.content, "utf8").toString("base64"),
              contentType: a.contentType,
            })),
          }
        : {}),
    });
    if (error) {
      console.error("[email] send failed:", error.message);
      return { sent: false, error: error.message };
    }
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] send threw:", message);
    return { sent: false, error: message };
  }
}
