/**
 * Vita's screens on the shared runtime: the handlers `next-auth/react` and the
 * password pages actually call, answered by AccountKit, on the real migration
 * chain plus the real import. Mail is captured at the shared mailer.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";

const SITE = "https://vita.example.test";
const state = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://vita.example.test";
  return { db: undefined as unknown, cookie: "" };
});

vi.mock("@/lib/db", () => ({
  getInstance: () => state.db,
  db: new Proxy({}, { get: (_, prop) => Reflect.get(state.db as object, prop) }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: state.cookie }),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/headers.js", () => ({
  headers: async () => new Headers({ cookie: state.cookie }),
  cookies: async () => ({ get: () => undefined }),
}));

const PASSWORD = "synthetic legacy password";
let pg: PGlite;
let ip = 0;

beforeAll(async () => {
  Object.assign(process.env, {
    AUTH_RUNTIME: "accountkit",
    DATABASE_URL: "postgres://synthetic",
    BETTER_AUTH_SECRET: "synthetic-vita-journey-secret-at-least-32-chars",
    ADMIN_EMAILS: "lead@example.test",
  });
  delete process.env.RESEND_API_KEY;
  pg = new PGlite();
  for (const file of (await readdir("drizzle")).filter((f) => f.endsWith(".sql")).sort()) {
    await pg.exec(await readFile(path.join("drizzle", file), "utf8"));
  }
  state.db = drizzle(pg, { schema: await import("@/lib/db/schema") });
});

afterAll(async () => pg?.close());

beforeEach(async () => {
  state.cookie = "";
  await pg.exec(`TRUNCATE users, auth_users, auth_accounts, auth_sessions,
    auth_verifications, auth_passkeys, auth_two_factors CASCADE`);
  await pg.query(
    `INSERT INTO users (id, email, email_verified, password, role) VALUES
      ('00000000-0000-4000-8000-000000000001', 'patient@example.test', now(), $1, 'patient'),
      ('00000000-0000-4000-8000-000000000002', 'lead@example.test', now(), $1, 'patient')`,
    [await bcrypt.hash(PASSWORD, 4)],
  );
  await pg.exec("BEGIN");
  await pg.exec(await readFile("scripts/db/accountkit-import.sql", "utf8"));
  await pg.exec("COMMIT");
});

function request(route: string, init: { body?: BodyInit; json?: unknown; get?: boolean } = {}) {
  ip += 1;
  const headers = new Headers({
    origin: SITE,
    "x-forwarded-for": `198.51.100.${ip % 250}`,
    cookie: state.cookie,
  });
  if (init.json !== undefined) headers.set("content-type", "application/json");
  return new NextRequest(`${SITE}${route}`, {
    method: init.get ? "GET" : "POST",
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
}

const cookieOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

async function signIn(email: string, password: string) {
  const { handlers } = await import("@/lib/auth");
  const form = new URLSearchParams({ email, password, csrfToken: "x" });
  const response = await handlers.POST(request("/api/auth/callback/credentials", { body: form }));
  return { url: String((await response.json()).url), cookie: cookieOf(response) };
}

async function session() {
  const { handlers } = await import("@/lib/auth");
  return (await handlers.GET(request("/api/auth/session", { get: true }))).json();
}

test("next-auth/react signs an imported patient in and reads the same session shape", async () => {
  const wrong = await signIn("patient@example.test", "wrong");
  expect(wrong.url).toContain("error=CredentialsSignin");
  expect(wrong.cookie).toBe("");

  const ok = await signIn("patient@example.test", PASSWORD);
  expect(ok.url).toBe(`${SITE}/dashboard`);
  state.cookie = ok.cookie;
  const current = await session();
  expect(current.user).toMatchObject({
    id: "00000000-0000-4000-8000-000000000001",
    email: "patient@example.test",
    role: "patient",
  });
  const { auth } = await import("@/lib/auth");
  expect((await auth())?.user.id).toBe("00000000-0000-4000-8000-000000000001");

  const { handlers } = await import("@/lib/auth");
  const out = await handlers.POST(request("/api/auth/signout", { body: new URLSearchParams() }));
  expect(out.status).toBe(200);
  expect(await session()).toEqual({});
});

test("env-listed admins are promoted, and a deleted or demoted row takes effect at once", async () => {
  state.cookie = (await signIn("lead@example.test", PASSWORD)).cookie;
  expect((await session()).user.role).toBe("admin");
  const { rows } = await pg.query<{ role: string }>(
    `SELECT role FROM users WHERE email = 'lead@example.test'`,
  );
  expect(rows[0].role).toBe("admin");

  state.cookie = (await signIn("patient@example.test", PASSWORD)).cookie;
  await pg.exec(`DELETE FROM users WHERE email = 'patient@example.test'`);
  expect(await session()).toEqual({});
});

test("the per-account lockout still holds on the shared runtime", async () => {
  for (let i = 0; i < 5; i++) await signIn("patient@example.test", "wrong");
  const locked = await signIn("patient@example.test", PASSWORD);
  expect(locked.url).toContain("error=CredentialsSignin");
  expect(locked.cookie).toBe("");
});

test("registration creates the domain row and the shared account under one id", async () => {
  const { POST } = await import("@/app/api/account/route");
  const created = await POST(
    request("/api/account", { json: { email: "new@example.test", password: "synthetic new" } }),
  );
  expect(created.status).toBe(201);
  const taken = await POST(
    request("/api/account", { json: { email: "new@example.test", password: "synthetic new" } }),
  );
  expect(taken.status).toBe(409);
  const ids = await pg.query<{ domain: string; shared: string }>(
    `SELECT u.id::text AS domain, a.id AS shared FROM users u JOIN auth_users a ON a.id = u.id::text
     WHERE u.email = 'new@example.test'`,
  );
  expect(ids.rows).toHaveLength(1);
  expect((await signIn("new@example.test", "synthetic new")).url).toBe(`${SITE}/dashboard`);
});

test("forgot, reset and change password run through AccountKit, with the page's link shape", async () => {
  const { sharedAuthMailer } = await import("@/lib/auth/shared/runtime");
  const sent: string[] = [];
  vi.spyOn(sharedAuthMailer, "configured", "get").mockReturnValue(true);
  vi.spyOn(sharedAuthMailer, "send").mockImplementation(async (_kind, _to, url) => {
    sent.push(url);
  });
  vi.resetModules();
  // A fresh runtime picks up the mail switch.
  const runtime = await import("@/lib/auth/shared/runtime");
  vi.spyOn(runtime.sharedAuthMailer, "configured", "get").mockReturnValue(true);
  vi.spyOn(runtime.sharedAuthMailer, "send").mockImplementation(async (_kind, _to, url) => {
    sent.push(url);
  });

  const forgot = (await import("@/app/api/auth/forgot-password/route")).POST;
  const reset = (await import("@/app/api/auth/reset-password/route")).POST;
  process.env.RESEND_API_KEY = "re_synthetic";
  process.env.RESEND_FROM = "Vita <vita@example.test>";
  try {
    expect(
      (
        await forgot(
          request("/api/auth/forgot-password", { json: { email: "patient@example.test" } }),
        )
      ).status,
    ).toBe(200);
  } finally {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
  }
  expect(sent).toHaveLength(1);
  // The mailed link redirects to the reset page with both values it reads.
  const { handlers } = await import("@/lib/auth");
  const link = new URL(sent[0]);
  const landing = await handlers.GET(request(`${link.pathname}${link.search}`, { get: true }));
  const page = new URL(landing.headers.get("location")!, SITE);
  expect(page.pathname).toBe("/reset-password");
  expect(page.searchParams.get("email")).toBe("patient@example.test");
  const token = page.searchParams.get("token")!;

  const done = await reset(
    request("/api/auth/reset-password", {
      json: { token, email: "patient@example.test", password: "synthetic reset" },
    }),
  );
  expect(done.status).toBe(200);
  expect((await signIn("patient@example.test", "synthetic reset")).url).toBe(`${SITE}/dashboard`);

  state.cookie = (await signIn("patient@example.test", "synthetic reset")).cookie;
  const change = (await import("@/app/api/auth/change-password/route")).POST;
  const refused = await change(
    request("/api/auth/change-password", {
      json: { currentPassword: "wrong", newPassword: "synthetic changed" },
    }),
  );
  expect(refused.status).toBe(401);
  const changed = await change(
    request("/api/auth/change-password", {
      json: { currentPassword: "synthetic reset", newPassword: "synthetic changed" },
    }),
  );
  expect(changed.status).toBe(200);
  expect((await signIn("patient@example.test", "synthetic changed")).url).toBe(`${SITE}/dashboard`);
});

test("with the flag off, /api/auth is NextAuth's and the shared tables stay unused", async () => {
  process.env.AUTH_RUNTIME = "nextauth";
  try {
    const { handlers } = await import("@/lib/auth");
    const csrf = await handlers.GET(request("/api/auth/csrf", { get: true }));
    expect((await csrf.json()).csrfToken).not.toBe("accountkit");
    expect((await pg.query("SELECT * FROM auth_sessions")).rows).toEqual([]);
  } finally {
    process.env.AUTH_RUNTIME = "accountkit";
  }
});
