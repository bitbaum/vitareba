/**
 * The AccountKit import on Vita's real schema: the committed migration chain,
 * a synthetic NextAuth snapshot, the import SQL, then AccountKit's own runtime
 * signing those people in. No production data.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import bcrypt from "bcryptjs";
import { createPasswordHasher } from "@bitbaum/accountkit/auth/hash";
import { createAuthInstance } from "@bitbaum/accountkit/auth/server";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { authTables } from "./schema";

const SITE = "https://vita.example.test";
const LEGACY = "synthetic legacy password";
const LONG = "x".repeat(80) + "tail";
let pg: PGlite;
let importSql: string;
let plainHash: string;
let sharedHash: string;

beforeAll(async () => {
  pg = new PGlite();
  const dir = path.join(process.cwd(), "drizzle");
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
    await pg.exec(await readFile(path.join(dir, file), "utf8"));
  }
  importSql = await readFile("scripts/db/accountkit-import.sql", "utf8");
  plainHash = await bcrypt.hash(LEGACY, 4);
  sharedHash = await createPasswordHasher(bcrypt, 4).hash(LONG);
});

afterAll(async () => pg?.close());

beforeEach(async () => {
  await pg.exec(`TRUNCATE users, auth_users, auth_accounts, auth_sessions,
    auth_verifications, auth_passkeys, auth_two_factors CASCADE`);
  await pg.query(
    `INSERT INTO users (id, name, email, email_verified, password, role, is_clinician) VALUES
      ('00000000-0000-4000-8000-000000000001', 'Synthetic patient', 'Patient@Example.test', now(), $1, 'patient', false),
      ('00000000-0000-4000-8000-000000000002', NULL, 'admin@example.test', NULL, $2, 'admin', true),
      ('00000000-0000-4000-8000-000000000003', 'Google only', 'google@example.test', now(), NULL, 'patient', false)`,
    [plainHash, sharedHash],
  );
  await pg.exec(`INSERT INTO accounts (user_id, type, provider, provider_account_id)
    VALUES ('00000000-0000-4000-8000-000000000003', 'oidc', 'google', 'synthetic-google-sub')`);
});

async function runImport(rollback = false) {
  await pg.exec("BEGIN");
  try {
    await pg.exec(importSql);
    await pg.exec(rollback ? "ROLLBACK" : "COMMIT");
  } catch (error) {
    await pg.exec("ROLLBACK");
    throw error;
  }
}

function runtime() {
  const auth = createAuthInstance({
    site: { url: SITE, title: "Vita", slug: "vita" },
    database: drizzle(pg, { schema: authTables }),
    schema: authTables,
    legacyBcrypt: bcrypt,
    mail: { configured: false, send: async () => {} },
    env: { NODE_ENV: "test", BETTER_AUTH_SECRET: "synthetic-vita-import-secret-at-least-32-chars" },
  });
  return (email: string, password: string) =>
    auth.handler(
      new Request(`${SITE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { origin: SITE, "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      }),
    );
}

test("keeps every user id, address, verification and password hash, and leaves NextAuth untouched", async () => {
  const before = (await pg.query("SELECT * FROM users ORDER BY id")).rows;
  await runImport();
  expect((await pg.query("SELECT * FROM users ORDER BY id")).rows).toEqual(before);
  expect(
    (await pg.query("SELECT id, email, email_verified, role FROM auth_users ORDER BY id")).rows,
  ).toEqual([
    {
      id: "00000000-0000-4000-8000-000000000001",
      email: "patient@example.test",
      email_verified: true,
      role: "customer",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      email: "admin@example.test",
      email_verified: false,
      role: "customer",
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      email: "google@example.test",
      email_verified: true,
      role: "customer",
    },
  ]);
  expect(
    (
      await pg.query(
        "SELECT user_id, provider_id, account_id, password FROM auth_accounts ORDER BY user_id, provider_id",
      )
    ).rows,
  ).toEqual([
    {
      user_id: "00000000-0000-4000-8000-000000000001",
      provider_id: "credential",
      account_id: "00000000-0000-4000-8000-000000000001",
      password: plainHash,
    },
    {
      user_id: "00000000-0000-4000-8000-000000000002",
      provider_id: "credential",
      account_id: "00000000-0000-4000-8000-000000000002",
      password: sharedHash,
    },
    {
      user_id: "00000000-0000-4000-8000-000000000003",
      provider_id: "google",
      account_id: "synthetic-google-sub",
      password: null,
    },
  ]);
  await runImport();
  expect(
    (await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM auth_accounts")).rows[0].n,
  ).toBe(3);
});

test("imported plain bcrypt and AccountKit $bs1$ hashes sign in through the shared runtime", async () => {
  await runImport();
  const signIn = runtime();
  expect((await signIn("patient@example.test", LEGACY)).status).toBe(200);
  expect((await signIn("patient@example.test", "wrong")).status).toBe(401);
  // Unverified, but mail is off here, so verification is not required.
  expect((await signIn("admin@example.test", LONG)).status).toBe(200);
  expect((await signIn("google@example.test", "anything")).status).toBe(401);
  const sessions = await pg.query<{ user_id: string }>(
    "SELECT user_id FROM auth_sessions ORDER BY user_id",
  );
  expect(sessions.rows.map((r) => r.user_id)).toEqual([
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
  ]);
});

test("a rehearsal leaves the shared tables empty", async () => {
  await runImport(true);
  expect((await pg.query("SELECT * FROM auth_users")).rows).toEqual([]);
  expect((await pg.query("SELECT * FROM auth_accounts")).rows).toEqual([]);
});

test("refuses a live shared runtime, changed passwords and colliding addresses", async () => {
  await runImport();
  await pg.exec(`UPDATE users SET password = 'changed' WHERE email = 'admin@example.test'`);
  await expect(runImport()).rejects.toThrow("snapshot differs");

  await pg.exec(`TRUNCATE auth_users CASCADE`);
  await pg.exec(`INSERT INTO auth_users (id, email) VALUES ('live', 'live@example.test');
    INSERT INTO auth_sessions (id, expires_at, token, user_id) VALUES ('s', now() + interval '1 day', 't', 'live')`);
  await expect(runImport()).rejects.toThrow("active shared runtime");

  await pg.exec(`TRUNCATE auth_users CASCADE`);
  await pg.exec(
    `INSERT INTO users (id, email) VALUES ('00000000-0000-4000-8000-000000000004', 'PATIENT@example.test ')`,
  );
  await expect(runImport()).rejects.toThrow("address reconciliation");
  expect((await pg.query("SELECT * FROM auth_users")).rows).toEqual([]);
});
