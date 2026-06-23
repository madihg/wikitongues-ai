import { test, expect } from "@playwright/test";

/**
 * Core-loop smoke. Boots the app and walks the public surface. The deeper
 * login -> annotate -> logged-in-Supabase -> leaderboard flow runs in CI once
 * DATABASE_URL + seeded users are present (see e2e/README).
 */

test("landing page renders the Wikitongues AI brand", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Wikitongues/i);
});

test("login page renders an email + password form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
});
