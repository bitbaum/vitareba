# AccountKit migration staging

Vita still signs in through NextAuth (`lib/auth/index.ts`). Migration
`drizzle/0017_accountkit_staging.sql` adds AccountKit's tables beside it under
the `auth_` prefix (`createAuthTables("auth_")` in `lib/db/schema.ts`), because
NextAuth already owns `users`, `accounts` and `sessions`. Nothing reads or
writes the new tables yet. The fleet's acceptance queue is
[Fleet's checkpoint](https://github.com/bitbaum/fleet/blob/main/docs/remediation-resume-2026-10-29.md).

## Rehearse the import

Against an isolated database holding an authorized snapshot, after the normal
migrations:

```sh
node scripts/db/rehearse-accountkit-import.mjs
```

It runs `scripts/db/accountkit-import.sql` in one transaction, always rolls
back, and prints only counts. There is no apply mode. It takes locks even
though it rolls back, so do not point it at the served database.

The import keeps each `users.id` as the shared user id, so the 31 tables that
reference it never move. Addresses are lower-cased and their verification is
kept (`email_verified IS NOT NULL`). Password hashes are copied byte for byte;
plain bcrypt and AccountKit `$bs1$` both sign in through `legacyBcrypt`. Roles
and `is_clinician` stay on `users`, never on AccountKit's generic role. Two
addresses that collide once normalized, drift between runs, or an already-used
shared runtime fail the transaction.

`lib/db/accountkit-import.test.ts` runs this on the committed migration chain
and signs the imported people in through AccountKit's runtime. It is not
production or browser evidence.

## Known gap: Google

NextAuth signs people in with Google directly. AccountKit offers the fleet's
shared sign-in broker and OrangeCat, not Google itself, and a broker subject is
not a Google subject. The import keeps each Google link as an inert `google`
row. Until Google reaches AccountKit (directly or through the broker with
account linking), a person who only ever used Google signs in by setting a
password through recovery to the address already on file.

## Shared runtime (built, off)

With `AUTH_RUNTIME=accountkit` and `BETTER_AUTH_SECRET` set, the runtime in
`lib/auth/shared/` answers every sign-in; unset, NextAuth answers as today.

- `auth()` keeps today's session shape (id, email, role, emailVerified), read
  from the shared session and the `users` row on every request, so a deleted
  account or changed role takes effect at once. Env-listed admins are promoted
  as before, promote-only. The guards and the proxy use the same reader.
- The pages keep `next-auth/react`. `/api/auth` answers its few calls
  (`session`, `csrf`, `providers`, `signout`, `callback/credentials`) from
  AccountKit and hands every other path to AccountKit itself.
- Password sign-in keeps Vita's per-account lockout beside AccountKit's
  limiter. Registration creates the `users` row and the shared account under
  one id. Forgot, reset and change password go through AccountKit; the mailed
  link still lands on `/reset-password?email=…&token=…`.

`lib/auth/shared/journeys.test.ts` runs these through the real handlers on the
migration chain and the real import. Not deployed or browser evidence.

## Before switching

1. Stop NextAuth writes, import once under locks, then set both settings
   together. Everyone signed in under NextAuth signs in again once. A rollback
   after shared password changes needs credential reconciliation.
2. Decide Google: wait for a Google provider in AccountKit, or accept that
   Google-only patients recover by email.
3. Prove sign-in, recovery, role changes and revocation on the deployed
   artifact with an approved test identity.
