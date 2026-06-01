import { test, expect } from '@playwright/test';
import { ensureLoggedIn } from './utils';

/**
 * 帳號 (Account) page hosts API Tokens, moved out of Settings.
 *
 * Two contracts to pin:
 *   1. Sidebar 帳號 link routes to /account and the page renders the API
 *      Tokens panel header.
 *   2. Settings no longer has an "API Tokens" tab — the tab nav now goes
 *      User Management → Notifications → Appearance → System.
 */

test('Sidebar 帳號 → /account renders the API Tokens panel', async ({ page }) => {
    await ensureLoggedIn(page);

    // Use the sidebar link rather than direct page.goto so we also exercise
    // the Link wiring change in MainLayout (the old 帳號 was a plain
    // <button> with no destination — this test catches a regression where
    // the link gets reverted to a button).
    const accountLink = page.locator('a[href$="/account"]').first();
    await expect(accountLink).toBeVisible();
    await accountLink.click();
    await page.waitForURL(/\/account$/, { timeout: 5000 });

    // Page heading
    await expect(page.locator('h1', { hasText: '帳號' })).toBeVisible();

    // API Tokens panel heading inside the content area
    await expect(page.locator('h2', { hasText: 'API Tokens' })).toBeVisible();

    // The "產生新 Token" form is the canonical create UI — its presence
    // proves the tab content actually mounted, not just the heading.
    await expect(page.locator('h3', { hasText: '產生新 Token' })).toBeVisible();
});

test('Settings page no longer has an API Tokens tab', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // The left tab nav should NOT contain a button labeled "API Tokens".
    // We scope to the <nav> so we don't accidentally match the new home of
    // the panel on /account or any incidental text on the page.
    const settingsNav = page.locator('nav').first();
    await expect(settingsNav).toBeVisible();
    await expect(settingsNav.locator('button', { hasText: 'API Tokens' })).toHaveCount(0);
});
