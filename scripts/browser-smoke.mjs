#!/usr/bin/env node
/**
 * The patient's way in, in a real browser, against a production server:
 * register, reach the dashboard, sign out, a wrong password refused, sign back
 * in, and the recovery pages render. Then every auth page at 390px, where
 * nothing may scroll sideways.
 *
 * Run once per sign-in runtime (NextAuth today, AccountKit behind
 * AUTH_RUNTIME=accountkit) by .github/workflows/browser-smoke.yml. Synthetic
 * people only; no mail leaves the machine (RESEND_API_KEY is unset).
 * SMOKE_IMPORTED_EMAIL names someone registered before the import.
 *
 *   BASE_URL=http://localhost:3000 SMOKE_LABEL=nextauth node scripts/browser-smoke.mjs
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const LABEL = process.env.SMOKE_LABEL ?? "default";
const OUT = path.join("browser-smoke-artifacts", LABEL);
const EXECUTABLE = process.env.BROWSER_EXECUTABLE ?? "/usr/bin/google-chrome";
const EMAIL = `smoke-${LABEL}@example.test`;
// Someone registered under the other runtime and imported: they keep their password.
const IMPORTED_EMAIL = process.env.SMOKE_IMPORTED_EMAIL;
const PASSWORD = "synthetic smoke password";
const AUTH_PAGES = ["/de/login", "/de/register", "/de/forgot-password", "/de/reset-password"];

const shot = (page, name) =>
  page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

function step(name) {
  console.log(`[smoke:${LABEL}] ${name}`);
}

async function signInThroughPage(page, password, email = EMAIL) {
  await page.goto(`${BASE}/de/login`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXECUTABLE });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    step("register");
    await page.goto(`${BASE}/de/register`);
    await page.fill("#email", EMAIL);
    await page.fill("#password", PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await shot(page, "dashboard-after-register");

    step("sign out from the account menu");
    await page.click('button[aria-label="User menu"]');
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL((url) => !url.pathname.includes("/dashboard"), { timeout: 30_000 });
    await page.goto(`${BASE}/dashboard`);
    await page.waitForURL(/\/login/, { timeout: 30_000 });

    step("a wrong password is refused");
    await signInThroughPage(page, "not the password");
    await page.locator('[class*="error"]').first().waitFor({ timeout: 30_000 });
    if (page.url().includes("/dashboard"))
      throw new Error("a wrong password reached the dashboard");
    await shot(page, "login-refused");

    step("sign in through the login page");
    await signInThroughPage(page, PASSWORD);
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    if (IMPORTED_EMAIL) {
      step("an imported person signs in with their old password");
      const imported = await (await browser.newContext()).newPage();
      await signInThroughPage(imported, PASSWORD, IMPORTED_EMAIL);
      await imported.waitForURL(/\/dashboard/, { timeout: 30_000 });
      await imported.close();
    }

    step("recovery pages render");
    const recovery = await browser.newPage();
    await recovery.goto(`${BASE}/de/forgot-password`);
    await recovery.locator("#email").waitFor();
    await recovery.goto(
      `${BASE}/de/reset-password?token=synthetic&email=${encodeURIComponent(EMAIL)}`,
    );
    await recovery.locator("#password").waitFor();
    await recovery.close();

    step("auth pages at 390px scroll only downwards");
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const small = await phone.newPage();
    for (const route of AUTH_PAGES) {
      await small.goto(`${BASE}${route}`);
      await small.waitForLoadState("networkidle");
      const overflow = await small.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      await shot(small, `390${route.replaceAll("/", "-")}`);
      if (overflow > 0) throw new Error(`${route} scrolls sideways by ${overflow}px at 390px`);
    }
    step("passed");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[smoke:${LABEL}] failed:`, error);
  process.exit(1);
});
