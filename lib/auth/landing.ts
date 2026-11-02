import { sanitizeReturnTo } from "@/lib/domain/auth";

/**
 * Where AccountKit's forms land after a sign-in or sign-up. An explicit,
 * same-origin `returnTo` wins. Otherwise the form lands back on the sign-in
 * page, and the proxy sends the signed-in person to where their role starts:
 * clinicians to the admin, patients to the dashboard (proxy.ts).
 */
export function landingAfterSignIn(returnTo: string | undefined, signInPath: string): string {
  return sanitizeReturnTo(returnTo, signInPath);
}
