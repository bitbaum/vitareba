# Accounts on AccountKit

Vita's accounts live in AccountKit (`@bitbaum/accountkit`), in its tables
beside Vita's own under the `auth_` prefix (`createAuthTables("auth_")` in
`lib/db/schema.ts`, migration `drizzle/0017_accountkit_staging.sql`), because
Vita's `users`, `accounts` and `sessions` keep their NextAuth-era names. The
fleet's acceptance queue is
[Fleet's checkpoint](https://github.com/bitbaum/fleet/blob/main/docs/remediation-resume-2026-10-29.md).

## Ways in

`/de/login`, `/de/register` and `/de/forgot-password` (and their `en`, `fr`
twins) render AccountKit's `SignInForm`, `SignUpForm` and recovery form in the
visitor's language (`authLabelsFor`). Each method is shown only when this
deployment can serve it (`lib/auth/methods.ts`, from env, read per request):

| Method                                    | Shown when                                                         |
| ----------------------------------------- | ------------------------------------------------------------------ |
| Email and password                        | always                                                             |
| Passkey                                   | always (added from the profile once signed in)                     |
| Second factor (authenticator app, codes)  | always (switched on from the profile)                              |
| Email sign-in link, password recovery     | account mail works (`RESEND_*`, a verified sender)                 |
| Continue with OrangeCat                   | `ORANGECAT_OAUTH_CLIENT_ID` and `_SECRET`                          |
| The shared bitbaum sign-in (Morulia)      | `SIGNIN_*` set **and** Morulia publishes at least one provider     |

The portal's profile renders AccountKit's `AccountPanel` (password, passkeys,
second factor, linked sign-ins, sign-out). It has **no delete button**: Swiss
law keeps medical records for ten years, so the runtime is created with
`accountDeletion: false` (`/api/auth/delete-user` answers 404) and the panel's
way out is the erasure request in "Privacy & data"
(`/api/account/deletion-request`, a tracked thread to the clinicians).

A sign-in lands where the person was going (`returnTo`), or else back on the
sign-in page, from which the proxy sends clinicians to the admin and patients
to the dashboard, as before. Old reset links (`/reset-password?token=…`) are
forwarded to the sign-in page, which sets the new password.

## What stayed Vita's

- `users` is still the row every table references; `users.role` and
  `is_clinician` are still the access model, never AccountKit's generic role.
  The session (`lib/auth/shared/session.ts`) is read from that row on every
  request, so a changed role or a removed row takes effect at once;
  `ADMIN_EMAILS` still promotes, never demotes.
- A person AccountKit creates gets the `users` row under the same id, an empty
  profile and the welcome sequence (`lib/auth/shared/accounts.ts`).
- The per-account lockout (`LOGIN_LOCKOUT_THRESHOLD` wrong passwords in a row,
  then `LOGIN_LOCKOUT_DURATION_MS` refused even with the right one) runs on
  AccountKit's sign-in as a plugin (`lib/auth/shared/vita-plugin.ts`), beside
  AccountKit's own limiter.
- The portal's `useSession` and `signOut` still speak next-auth/react;
  AccountKit's compat layer answers them (`lib/auth/shared/compat.ts`).

AccountKit is the only writer of credentials. Vita's own registration,
forgot-, reset- and change-password routes and NextAuth itself are gone.

## The switch (2026-11)

The import (`scripts/db/accountkit-import.sql`) keeps each `users.id` as the
shared user id, lower-cases addresses, keeps their verification and copies
password hashes byte for byte; plain bcrypt and AccountKit `$bs1$` both sign in
through `legacyBcrypt`. Address collisions, drift between runs or an
already-used shared runtime fail the whole transaction.

It runs on the box through loki's `accountkit-switch.yml`
(`scripts/hetzner/accountkit-cutover.sh`), never by hand:

- `rehearse` restores last night's dump into a temporary database, runs the
  import there with a throwaway legacy account, prints counts, rolls back and
  drops it: the import rehearsal and the restore proof of the backup.
- `switch` takes a fresh dump and rehearses it, stops the app for the import,
  sets `AUTH_RUNTIME=accountkit`, and proves on the public site that an
  imported bcrypt account signs in and that roles are unchanged.
- `prove` runs sign-up, sign-out, a wrong password, sign-in on the live site.

`lib/auth/shared/journeys.test.ts` runs the journeys through the real handlers
on the migration chain and the real import; `.github/workflows/browser-smoke.yml`
drives Chromium through every way in at 320 and 390px, including an account
seeded before the import.

## Rolling back

Revert the pull request that moved the screens first: the bridged NextAuth
screens come back and keep answering from AccountKit. Only then, if needed,
run the workflow's `rollback`, which empties `AUTH_RUNTIME` and restarts and
never empties a table. Passwords changed, passkeys added or second factors set
after the switch live only in the `auth_` tables, so a rollback past the
switch needs credential reconciliation; it must not restore an older hash.
