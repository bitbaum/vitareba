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

## Before switching

1. Runtime behind a flag: an `auth()` with today's session shape (id, role,
   emailVerified) read from the shared session and `users` on every request;
   the existing guards unchanged; login, register and reset served by
   AccountKit; the admin-email promotion and per-account lockout kept.
2. Stop NextAuth writes, import once under locks, switch together. A rollback
   after shared password changes needs credential reconciliation.
3. Prove sign-in, recovery, Google parity, role changes and revocation on the
   deployed artifact with an approved test identity.
