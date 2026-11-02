import { signInMethods, type SignInMethods } from "@bitbaum/accountkit/auth";
import { sharedAuthMailer } from "./shared/runtime";

/**
 * Which sign-in methods this deployment offers, from its env: password,
 * passkeys and two-factor always; the email link and recovery when account
 * mail works; OrangeCat with ORANGECAT_OAUTH_*; the shared bitbaum sign-in
 * with SIGNIN_*. A method whose env is missing is hidden. Read per request:
 * it is runtime env.
 */
export function vitaMethods(env: NodeJS.ProcessEnv = process.env): SignInMethods {
  return signInMethods(env, sharedAuthMailer.configured);
}
