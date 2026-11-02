#!/usr/bin/env node
/**
 * Every way into a Vita account, in a real browser against the production
 * server and a PostgreSQL built from the committed migrations plus the cutover
 * import (.github/workflows/browser-smoke.yml):
 *
 *   - the sign-in, sign-up and recovery pages at 320px and 390px: no sideways
 *     scroll, and the method set the env asks for (password, passkey, the email
 *     link and recovery with mail, OrangeCat, the bitbaum sign-in);
 *   - the portal sends a stranger to sign-in;
 *   - sign up through AccountKit's form, sign out, a wrong password refused,
 *     the right one accepted;
 *   - an account imported from NextAuth (bcrypt, seeded before the import, an
 *     admin) signs in with its old password, keeps its role and starts in the
 *     admin, as clinicians always did;
 *   - the profile's account panel offers passkeys and a second factor, and in
 *     place of a delete button the erasure request (medical records are kept).
 *
 * The words are AccountKit's own German labels (authLabelsFor), the ones the
 * auth pages render; the portal itself is English. Synthetic people only; no
 * mail leaves the machine.
 *
 *   BASE_URL=http://localhost:3000 LEGACY_EMAIL=… LEGACY_PASSWORD=… node scripts/browser-smoke.mjs
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { authLabelsFor } from "@bitbaum/accountkit/auth";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const LOCALE = "de";
const L = authLabelsFor(LOCALE);
const OUT = "browser-smoke-artifacts";
const LEGACY_EMAIL = process.env.LEGACY_EMAIL;
const LEGACY_PASSWORD = process.env.LEGACY_PASSWORD;
const run = Date.now().toString(36);
const EMAIL = `smoke-${run}@example.test`;
const PASSWORD = `synthetic smoke password ${run}`;
const TIMEOUT = 30_000;

const EXPECT = {
  orangecat: Boolean(process.env.ORANGECAT_OAUTH_CLIENT_ID),
  signin: Boolean(process.env.SIGNIN_CLIENT_ID),
  mail: Boolean(process.env.RESEND_API_KEY),
};

const url = (route) => `${BASE}/${LOCALE}${route}`;
const at = (pathname) => (u) => u.pathname === pathname;
const shot = (page, name) =>
  page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
const button = (page, name) => page.getByRole("button", { name, exact: true });
const session = (page) =>
  page.evaluate(async () => (await (await fetch("/api/auth/session")).json())?.user ?? null);

const failures = [];
function check(ok, what) {
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
}

async function signIn(page, email, password) {
  await page.goto(url("/login"));
  await page.locator('input[autocomplete="username webauthn"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await button(page, L.signIn).click();
}

/** The header's account menu (next-auth/react's signOut, answered by AccountKit). */
async function signOut(page) {
  await page.goto(`${BASE}/profile`);
  await page.waitForLoadState("networkidle");
  await page.click('button[aria-label="User menu"]');
  await page.getByRole("banner").getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/profile"), { timeout: TIMEOUT });
}

/** The account panel's own sign-out (AccountKit's client). */
async function signOutFromPanel(page) {
  await page.goto(`${BASE}/profile`);
  await page.waitForLoadState("networkidle");
  await page
    .locator("#account")
    .getByRole("button", { name: authLabelsFor("en").account.signOut, exact: true })
    .click();
  await page.waitForURL((u) => !u.pathname.startsWith("/profile"), { timeout: TIMEOUT });
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch(
  process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {},
);
let page;

try {
  // ── Every auth page at phone widths ────────────────────────────────────
  for (const width of [320, 390]) {
    const phone = await browser.newPage({ viewport: { width, height: 844 } });
    for (const route of ["/login", "/register", "/forgot-password"]) {
      await phone.goto(url(route));
      await phone.waitForLoadState("networkidle");
      const overflow = await phone.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      check(overflow <= 0, `${route} at ${width}px has no sideways scroll (${overflow}px)`);
      await shot(phone, `${width}${route.replaceAll("/", "-")}`);
    }
    await phone.close();
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  // ── A stranger is sent to sign-in ──────────────────────────────────────
  await page.goto(`${BASE}/dashboard`);
  await page.waitForURL((u) => u.pathname.endsWith("/login"), { timeout: TIMEOUT });
  check(true, "the portal sends a stranger to sign-in");

  // ── The method set, on the sign-in and the sign-up page ────────────────
  const offered = async (route, labels) => {
    await page.goto(url(route));
    for (const [name, wanted] of labels) {
      const count = await button(page, name).count();
      check(
        wanted ? count === 1 : count === 0,
        `${route} ${wanted ? "offers" : "hides"} "${name}"`,
      );
    }
  };
  await offered("/login", [
    [L.signIn, true],
    [L.withPasskey, true],
    [L.withLink, EXPECT.mail],
    [L.withOrangecat, EXPECT.orangecat],
  ]);
  await shot(page, "login-methods");
  await offered("/register", [
    [L.createAccount, true],
    [L.withOrangecat, EXPECT.orangecat],
  ]);

  // ── Sign up through AccountKit's form ──────────────────────────────────
  await page.goto(url("/register"));
  await page.locator('input[autocomplete="email"]').fill(EMAIL);
  await page.locator('input[autocomplete="new-password"]').fill(PASSWORD);
  await button(page, L.createAccount).click();
  await page.waitForURL(at("/dashboard"), { timeout: TIMEOUT });
  const created = await session(page);
  check(created?.email === EMAIL, "sign-up signs the new patient in");
  check(created?.role === "patient", "a new account is a patient");
  await shot(page, "after-register");

  // ── The account panel: passkeys, a second factor, no delete button ─────
  await page.goto(`${BASE}/profile`);
  await page.waitForLoadState("networkidle");
  const en = authLabelsFor("en");
  for (const title of [en.account.passkeys, en.account.twoFactor]) {
    check(
      (await page.getByText(title, { exact: true }).count()) > 0,
      `the profile offers ${title}`,
    );
  }
  check(
    (await button(page, en.account.delete).count()) === 0,
    "the profile has no delete button (records are kept)",
  );
  check(
    (await page.getByRole("link", { name: "Request account deletion" }).count()) === 1,
    "the panel leads to the erasure request instead",
  );
  await shot(page, "profile-account-panel");

  // ── Sign out, a wrong password, the right one ──────────────────────────
  await signOut(page);
  check((await session(page)) === null, "sign-out ends the session");
  await page.goto(`${BASE}/dashboard`);
  await page.waitForURL((u) => u.pathname.endsWith("/login"), { timeout: TIMEOUT });
  check(true, "the portal is closed again after sign-out");

  await signIn(page, EMAIL, "not the password");
  await page.getByText(L.errors.INVALID_EMAIL_OR_PASSWORD).waitFor({ timeout: TIMEOUT });
  check((await session(page)) === null, "a wrong password is refused");
  await shot(page, "login-refused");

  await signIn(page, EMAIL, PASSWORD);
  await page.waitForURL(at("/dashboard"), { timeout: TIMEOUT });
  check((await session(page))?.email === EMAIL, "sign-in with the right password works");
  await signOutFromPanel(page);
  check((await session(page)) === null, "the account panel's sign-out ends the session");

  // ── An account imported from NextAuth ──────────────────────────────────
  if (LEGACY_EMAIL && LEGACY_PASSWORD) {
    await signIn(page, LEGACY_EMAIL, LEGACY_PASSWORD);
    await page.waitForURL(at("/admin/patients"), { timeout: TIMEOUT });
    const legacy = await session(page);
    check(
      legacy?.email === LEGACY_EMAIL && legacy?.role === "admin",
      "an imported clinician signs in with their old password, keeps admin and starts in the admin",
    );
    await signOut(page);
  } else {
    check(false, "LEGACY_EMAIL and LEGACY_PASSWORD are set");
  }

  check(pageErrors.length === 0, `no uncaught page errors (${pageErrors.join(" | ")})`);
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  console.error(error);
  await page
    ?.screenshot({ path: path.join(OUT, "failure.png"), fullPage: true })
    .catch((e) => console.error("[smoke] failure screenshot not taken", e.message));
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nsmoke: every way in works");
