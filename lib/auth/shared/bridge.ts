/**
 * Vita's screens on the shared runtime, unchanged.
 *
 * The pages use `next-auth/react` (signIn, signOut, useSession, getSession) and
 * Vita's own password routes. With AUTH_RUNTIME=accountkit those calls are
 * answered here from AccountKit, so no NextAuth credential writer runs beside
 * the shared one and no page has to learn a second protocol. AccountKit owns
 * every hash, session, limiter and recovery token.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getInstance } from "@/lib/db";
import { authAccounts, authUsers, profiles, users } from "@/lib/db/schema";
import { isUserLocked, nextLoginAttemptState } from "@/lib/domain/auth";
import { AUTH_ROUTES } from "@/lib/config/routes";
import { PORTAL_URL } from "@/lib/config/company";
import { sharedAuth } from "./runtime";
import { sharedSessionFor } from "./session";

interface SharedAnswer {
  status: number;
  body: Record<string, unknown>;
  cookies: string[];
}

/** Run one AccountKit endpoint for this request, through its own limiter. */
export async function callShared(
  request: Request,
  route: string,
  body: Record<string, unknown>,
): Promise<SharedAnswer> {
  const origin = new URL(PORTAL_URL).origin;
  const headers = new Headers({ origin, "content-type": "application/json" });
  for (const name of ["cookie", "x-forwarded-for", "x-real-ip", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const response = await sharedAuth.POST(
    new Request(`${origin}/api/auth${route}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // Nothing to translate.
  }
  return { status: response.status, body: parsed, cookies: response.headers.getSetCookie() };
}

function withCookies(response: NextResponse, cookies: string[]) {
  for (const cookie of cookies) response.headers.append("set-cookie", cookie);
  return response;
}

const loginError = (code: string) => `${PORTAL_URL}${AUTH_ROUTES.login}?error=${code}`;

/**
 * NextAuth's client protocol, answered by the shared runtime. Returns null for
 * any other path, which then goes to AccountKit itself.
 */
export async function nextAuthClientCompat(request: Request): Promise<Response | null> {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "");
  if (request.method === "GET" && path === "/session") {
    return NextResponse.json((await sharedSessionFor(request.headers)) ?? {});
  }
  if (request.method === "GET" && path === "/csrf") {
    // AccountKit checks the request origin itself; the client only needs a value.
    return NextResponse.json({ csrfToken: "accountkit" });
  }
  if (request.method === "GET" && path === "/providers") {
    return NextResponse.json({
      credentials: { id: "credentials", name: "Credentials", type: "credentials" },
    });
  }
  if (request.method === "POST" && path === "/signout") {
    const answer = await callShared(request, "/sign-out", {});
    return withCookies(NextResponse.json({ url: PORTAL_URL }), answer.cookies);
  }
  if (request.method === "POST" && path === "/callback/credentials") {
    const form = await request.formData().catch(() => null);
    const email = String(form?.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(form?.get("password") ?? "");
    return credentialSignIn(request, email, password);
  }
  return null;
}

/** Password sign-in with Vita's per-account lockout kept beside AccountKit's limiter. */
async function credentialSignIn(request: Request, email: string, password: string) {
  const db = getInstance();
  const user = email
    ? await db.query.users.findFirst({
        where: eq(users.email, email),
        columns: { id: true, failedLoginAttempts: true, lockedUntil: true },
      })
    : undefined;
  // Locked: refused even with the right password, and without asking AccountKit.
  if (user && isUserLocked(user)) {
    return NextResponse.json({ url: loginError("CredentialsSignin") });
  }
  const answer = await callShared(request, "/sign-in/email", { email, password });
  const valid = answer.status === 200;
  if (user) {
    await db.update(users).set(nextLoginAttemptState(user, valid)).where(eq(users.id, user.id));
  }
  if (!valid) {
    const code =
      answer.body.code === "EMAIL_NOT_VERIFIED" ? "EmailNotVerified" : "CredentialsSignin";
    return NextResponse.json({ url: loginError(code) });
  }
  return withCookies(NextResponse.json({ url: `${PORTAL_URL}/dashboard` }), answer.cookies);
}

/**
 * Registration: the domain row first (its id is the shared user id), then the
 * shared account and its password, through AccountKit's own hasher.
 */
export async function sharedRegister(
  email: string,
  password: string,
): Promise<"created" | "taken"> {
  const db = getInstance();
  const ctx = await sharedAuth.getAuth().$context;
  const hashed = await ctx.password.hash(password);
  return db.transaction(async (tx) => {
    const taken =
      (await tx.query.users.findFirst({ where: eq(users.email, email), columns: { id: true } })) ??
      (await tx.query.authUsers.findFirst({
        where: eq(authUsers.email, email),
        columns: { id: true },
      }));
    if (taken) return "taken";
    const [created] = await tx.insert(users).values({ email }).returning({ id: users.id });
    await tx.insert(profiles).values({ userId: created.id });
    await tx.insert(authUsers).values({ id: created.id, email, name: "" });
    await tx.insert(authAccounts).values({
      id: `vita-credential:${created.id}`,
      accountId: created.id,
      providerId: "credential",
      userId: created.id,
      password: hashed,
    });
    return "created";
  });
}

export async function sharedForgotPassword(request: Request, email: string) {
  const answer = await callShared(request, "/request-password-reset", {
    email,
    // The reset page reads both; AccountKit adds the token to this query.
    redirectTo: `${PORTAL_URL}${AUTH_ROUTES.resetPassword}?email=${encodeURIComponent(email)}`,
  });
  return answer.status === 200;
}

export async function sharedResetPassword(request: Request, token: string, password: string) {
  const answer = await callShared(request, "/reset-password", { token, newPassword: password });
  return answer.status === 200;
}

export async function sharedChangePassword(
  request: Request,
  currentPassword: string,
  newPassword: string,
) {
  const answer = await callShared(request, "/change-password", {
    currentPassword,
    newPassword,
    revokeOtherSessions: true,
  });
  return { ok: answer.status === 200, cookies: answer.cookies };
}
