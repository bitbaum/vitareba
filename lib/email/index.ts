import { Resend } from "resend";
import { DEFAULT_FROM_EMAIL } from "@/lib/config/company";

// Lazy client — only instantiated when RESEND_API_KEY is present at call time
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM = process.env.RESEND_FROM ?? DEFAULT_FROM_EMAIL;

/** Whether the email provider is usable at all. Flows that DEPEND on an email
 *  arriving (password reset) must check this and fail loudly instead of
 *  letting a patient wait for an email that will never come. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

type SendOptions = {
  to: string | string[];
  subject: string;
  html: string;
};

export type SendResult = { sent: true } | { sent: false; error: string };

/**
 * Send an email. Never throws — returns an honest result instead.
 * The Resend SDK reports API failures via its return value, not exceptions,
 * so ignoring the result means "sent" can silently be a lie. Callers where
 * delivery matters (email queue, password reset) must check `.sent`.
 */
export async function sendEmail({ to, subject, html }: SendOptions): Promise<SendResult> {
  if (!isEmailConfigured()) {
    // Dev/build without key: log so developers see the email content
    console.log(`[email] To: ${JSON.stringify(to)}\nSubject: ${subject}`);
    return { sent: false, error: "RESEND_API_KEY not configured" };
  }
  try {
    const { error } = await getResend().emails.send({
      from: FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
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
