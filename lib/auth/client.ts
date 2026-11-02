"use client";
/**
 * The browser client for AccountKit's screens (SignInForm, SignUpForm,
 * PasswordRecoveryForm, AccountPanel). Pages that only read who is signed in
 * keep `useSession` and `signOut` from next-auth/react (lib/auth/shared/compat.ts).
 */
import { createAuthClient } from "better-auth/react";
import { authClientPlugins } from "@bitbaum/accountkit/auth/client";

export const authClient = createAuthClient({ plugins: authClientPlugins() });
