/**
 * What is Vita's own on AccountKit's endpoints (`plugins` in runtime.ts): the
 * per-account lockout beside AccountKit's limiter. After
 * LOGIN_LOCKOUT_THRESHOLD wrong passwords in a row an account is refused for
 * LOGIN_LOCKOUT_DURATION_MS, even with the right one, and the refusal reads
 * exactly like a wrong password (lib/domain/auth.ts).
 */
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";
import { getInstance } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isUserLocked, nextLoginAttemptState } from "@/lib/domain/auth";

const PASSWORD_SIGN_IN = "/sign-in/email";

function emailOf(body: unknown): string {
  const value = (body as { email?: unknown } | undefined)?.email;
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function attemptsFor(email: string) {
  if (!email) return undefined;
  return getInstance().query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true, failedLoginAttempts: true, lockedUntil: true },
  });
}

export function vitaPlugin(): BetterAuthPlugin {
  return {
    id: "vita",
    hooks: {
      before: [
        {
          matcher: ({ path }) => path === PASSWORD_SIGN_IN,
          handler: createAuthMiddleware(async (ctx) => {
            const user = await attemptsFor(emailOf(ctx.body));
            if (user && isUserLocked(user)) {
              throw new APIError("UNAUTHORIZED", {
                code: "INVALID_EMAIL_OR_PASSWORD",
                message: "Invalid email or password",
              });
            }
          }),
        },
      ],
      after: [
        {
          matcher: ({ path }) => path === PASSWORD_SIGN_IN,
          handler: createAuthMiddleware(async (ctx) => {
            const user = await attemptsFor(emailOf(ctx.body));
            if (!user || isUserLocked(user)) return;
            // Only a refused password counts against the account: a second
            // factor still to come is not a failure, and a limited request
            // (429) never reached the password.
            const returned = ctx.context.returned as { statusCode?: number } | undefined;
            const refused = returned instanceof Error && returned.statusCode === 401;
            if (!refused && !ctx.context.newSession && returned instanceof Error) return;
            const success = !refused;
            // A counter that fails to save must never fail the sign-in.
            await getInstance()
              .update(users)
              .set(nextLoginAttemptState(user, success))
              .where(eq(users.id, user.id))
              .catch((error) =>
                console.error("[auth] login attempt state not saved", {
                  error: error instanceof Error ? error.message : String(error),
                }),
              );
          }),
        },
      ],
    },
  };
}
