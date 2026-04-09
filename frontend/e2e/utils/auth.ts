import type { Page } from '@playwright/test';

/**
 * Ensure the current page session is authenticated.
 *
 * Checks for a password input to detect the login screen; if found, fills
 * credentials from environment variables and submits.  Credentials fall back
 * to the shared CI test account (low-privilege, safe to commit).
 *
 * Call this at the start of every test that requires authentication:
 *
 *   await ensureLoggedIn(page);
 */
export async function ensureLoggedIn(page: Page): Promise<void> {
    await page.goto('/');
    const isLoginPage = await page
        .locator('input[type="password"]')
        .isVisible({ timeout: 3000 })
        .catch(() => false);

    if (!isLoginPage) return;

    await page.fill(
        'input[type="email"], input[type="text"]',
        process.env.TEST_EMAIL ?? 'CI_test@kkday.com',
    );
    await page.fill(
        'input[type="password"]',
        process.env.TEST_PASSWORD ?? 'KKday1234567890!',
    );
    await page.click('button[type="submit"]');

    // Wait until the password field disappears (redirect to app root)
    await page.waitForFunction(
        () => !document.querySelector('input[type="password"]'),
        { timeout: 10_000 },
    );
}
