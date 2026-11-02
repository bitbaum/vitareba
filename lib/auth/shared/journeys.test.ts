/**
 * Vita's accounts on AccountKit's own endpoints (the ones its sign-in,
 * sign-up, recovery and account screens call) and on the next-auth/react
 * protocol the portal still speaks, on the real migration chain plus the real
 * import. Mail is captured at the shared mailer.
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
const PATIENT = "00000000-0000-4000-8000-000000000001";
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
    auth_verifications, auth_passkeys, auth_two_factors, email_queue CASCADE`);
  await pg.query(
    `INSERT INTO users (id, email, email_verified, password, role) VALUES
      ('${PATIENT}', 'patient@example.test', now(), $1, 'patient'),
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

async function post(route: string, json: unknown) {
  const { handlers } = await import("@/lib/auth");
  return handlers.POST(request(`/api/auth${route}`, { json }));
}

/** AccountKit's own password sign-in, as SignInForm calls it. */
async function signIn(email: string, password: string) {
  const response = await post("/sign-in/email", { email, password });
  return { status: response.status, cookie: cookieOf(response) };
}

/** next-auth/react's session call, as the portal's useSession makes it. */
async function session() {
  const { handlers } = await import("@/lib/auth");
  return (await handlers.GET(request("/api/auth/session", { get: true }))).json();
}

test("an imported patient signs in with their NextAuth password and reads the same session shape", async () => {
  const wrong = await signIn("patient@example.test", "wrong");
  expect(wrong.status).toBe(401);
  expect(wrong.cookie).toBe("");

  const ok = await signIn("patient@example.test", PASSWORD);
  expect(ok.status).toBe(200);
  state.cookie = ok.cookie;
  expect((await session()).user).toMatchObject({
    id: PATIENT,
    email: "patient@example.test",
    role: "patient",
  });
  const { auth } = await import("@/lib/auth");
  expect((await auth())?.user.id).toBe(PATIENT);

  // next-auth/react's signOut, as the portal's menu calls it.
  const { handlers } = await import("@/lib/auth");
  const out = await handlers.POST(request("/api/auth/signout", { body: new URLSearchParams() }));
  expect(out.status).toBe(200);
  state.cookie = cookieOf(out) || state.cookie;
  expect(await session()).toBeNull();
});

test("env-listed admins are promoted, and a deleted row takes effect at once", async () => {
  state.cookie = (await signIn("lead@example.test", PASSWORD)).cookie;
  expect((await session()).user.role).toBe("admin");
  const { rows } = await pg.query<{ role: string }>(
    `SELECT role FROM users WHERE email = 'lead@example.test'`,
  );
  expect(rows[0].role).toBe("admin");

  state.cookie = (await signIn("patient@example.test", PASSWORD)).cookie;
  await pg.exec(`DELETE FROM users WHERE email = 'patient@example.test'`);
  expect(await session()).toBeNull();
});

test("the per-account lockout holds on AccountKit's sign-in, and a success clears the count", async () => {
  for (let i = 0; i < 4; i++)
    expect((await signIn("patient@example.test", "wrong")).status).toBe(401);
  expect((await signIn("patient@example.test", PASSWORD)).status).toBe(200);
  const cleared = await pg.query<{ n: number }>(
    `SELECT failed_login_attempts AS n FROM users WHERE id = '${PATIENT}'`,
  );
  expect(cleared.rows[0].n).toBe(0);

  for (let i = 0; i < 5; i++) await signIn("patient@example.test", "wrong");
  const locked = await signIn("patient@example.test", PASSWORD);
  expect(locked.status).toBe(401);
  expect(locked.cookie).toBe("");
});

test("a sign-up gets Vita's users row under the shared id, a profile and the welcome sequence", async () => {
  const created = await post("/sign-up/email", {
    email: "new@example.test",
    password: "synthetic new",
    name: "",
  });
  expect(created.status).toBe(200);
  const ids = await pg.query<{ domain: string; role: string }>(
    `SELECT u.id::text AS domain, u.role FROM users u JOIN auth_users a ON a.id = u.id::text
     WHERE u.email = 'new@example.test'`,
  );
  expect(ids.rows).toHaveLength(1);
  expect(ids.rows[0].role).toBe("patient");
  const extra = await pg.query<{ profiles: number; queued: number }>(
    `SELECT (SELECT count(*)::int FROM profiles WHERE user_id::text = $1) AS profiles,
            (SELECT count(*)::int FROM email_queue WHERE user_id::text = $1) AS queued`,
    [ids.rows[0].domain],
  );
  expect(extra.rows[0].profiles).toBe(1);
  expect(extra.rows[0].queued).toBeGreaterThan(0);

  const again = await post("/sign-up/email", {
    email: "new@example.test",
    password: "synthetic new",
    name: "",
  });
  expect(again.status).not.toBe(200);
  expect((await signIn("new@example.test", "synthetic new")).status).toBe(200);
});

test("recovery and a password change run through AccountKit; the reset link lands on sign-in", async () => {
  vi.resetModules();
  const runtime = await import("@/lib/auth/shared/runtime");
  const sent: string[] = [];
  vi.spyOn(runtime.sharedAuthMailer, "configured", "get").mockReturnValue(true);
  vi.spyOn(runtime.sharedAuthMailer, "send").mockImplementation(async (_kind, _to, url) => {
    sent.push(url);
  });

  const asked = await post("/request-password-reset", {
    email: "patient@example.test",
    redirectTo: `${SITE}/de/login`,
  });
  expect(asked.status).toBe(200);
  expect(sent).toHaveLength(1);
  const { handlers } = await import("@/lib/auth");
  const link = new URL(sent[0]);
  const landing = await handlers.GET(request(`${link.pathname}${link.search}`, { get: true }));
  const page = new URL(landing.headers.get("location")!, SITE);
  expect(page.pathname).toBe("/de/login");
  const token = page.searchParams.get("token")!;
  expect(token).toBeTruthy();

  expect((await post("/reset-password", { token, newPassword: "synthetic reset" })).status).toBe(
    200,
  );
  expect((await signIn("patient@example.test", PASSWORD)).status).toBe(401);
  const reset = await signIn("patient@example.test", "synthetic reset");
  expect(reset.status).toBe(200);

  state.cookie = reset.cookie;
  const refused = await post("/change-password", {
    currentPassword: "wrong",
    newPassword: "synthetic changed",
  });
  expect(refused.status).not.toBe(200);
  const changed = await post("/change-password", {
    currentPassword: "synthetic reset",
    newPassword: "synthetic changed",
    revokeOtherSessions: true,
  });
  expect(changed.status).toBe(200);
  expect((await signIn("patient@example.test", "synthetic changed")).status).toBe(200);
});

test("a patient cannot delete their account: records are kept, erasure is a request", async () => {
  const ok = await signIn("patient@example.test", PASSWORD);
  state.cookie = ok.cookie;
  const refused = await post("/delete-user", { password: PASSWORD });
  expect(refused.status).toBe(404);
  const rows = await pg.query<{ users: number; shared: number }>(
    `SELECT (SELECT count(*)::int FROM users WHERE id = '${PATIENT}') AS users,
            (SELECT count(*)::int FROM auth_users WHERE id = '${PATIENT}') AS shared`,
  );
  expect(rows.rows[0]).toEqual({ users: 1, shared: 1 });
  expect((await session()).user.id).toBe(PATIENT);
});

test("without AUTH_RUNTIME=accountkit nothing is written: every auth route is unavailable", async () => {
  process.env.AUTH_RUNTIME = "";
  try {
    const response = await post("/sign-up/email", {
      email: "early@example.test",
      password: "synthetic early",
      name: "",
    });
    expect(response.status).toBe(503);
    const rows = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM auth_users WHERE email = 'early@example.test'`,
    );
    expect(rows.rows[0].n).toBe(0);
  } finally {
    process.env.AUTH_RUNTIME = "accountkit";
  }
});
