"use client";

import {
  AccountPanel as SharedAccountPanel,
  PasswordRecoveryForm,
  SignInForm as SharedSignInForm,
  SignUpForm as SharedSignUpForm,
  type AuthClasses,
} from "@bitbaum/accountkit/auth/react";
// Types only: the runtime half of this entry point pulls in node:crypto.
import type { AuthLabels, SignInMethods } from "@bitbaum/accountkit/auth";
import type { ComponentProps, ReactNode } from "react";
import { authClient } from "@/lib/auth/client";
import styles from "./auth-forms.module.css";

/** AccountKit's shared forms in Vita's look. */
export const AUTH_CLASSES: Partial<AuthClasses> = {
  stack: styles.stack,
  field: styles.field,
  label: styles.label,
  input: styles.input,
  inputWrap: styles.inputWrap,
  reveal: styles.reveal,
  hint: styles.hint,
  notice: styles.notice,
  error: styles.error,
  button: styles.button,
  buttonQuiet: styles.buttonQuiet,
  link: styles.link,
  divider: styles.divider,
  check: styles.check,
  section: styles.section,
  sectionTitle: styles.sectionTitle,
};

type Common = {
  labels: AuthLabels;
  methods: SignInMethods;
  /** Where to land after signing in. */
  next: string;
  /** This locale's sign-in page (/de/login): where failed round trips return. */
  signInPath: string;
};

export function SignInForm(props: Common & { initialError: boolean; signUpLink: ReactNode }) {
  return <SharedSignInForm {...props} client={authClient} classes={AUTH_CLASSES} />;
}

export function SignUpForm(props: Common & { signUpPath: string; signInLink: ReactNode }) {
  return <SharedSignUpForm {...props} client={authClient} classes={AUTH_CLASSES} />;
}

export function RecoveryForm(
  props: Pick<
    ComponentProps<typeof PasswordRecoveryForm>,
    "methods" | "next" | "onBack" | "labels" | "signInPath"
  >,
) {
  return <PasswordRecoveryForm {...props} client={authClient} classes={AUTH_CLASSES} />;
}

export function AccountPanel(
  props: Pick<
    ComponentProps<typeof SharedAccountPanel>,
    | "user"
    | "linked"
    | "methods"
    | "accountPath"
    | "homePath"
    | "labels"
    | "deletion"
    | "ownProfile"
  >,
) {
  return (
    <div className={styles.panel}>
      <SharedAccountPanel {...props} client={authClient} classes={AUTH_CLASSES} />
    </div>
  );
}
