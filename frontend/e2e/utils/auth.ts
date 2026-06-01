import type { Page } from '@playwright/test';
import { getTestCredentials } from './secrets';

/**
 * Ensure the current page session is authenticated.
 *
 * Checks for a password input to detect the login screen; if found, fills
 * credentials from `getTestCredentials()` and submits. Credentials come
 * from the secret service (`production/TCMS/TCMS_email`) or
 * `TEST_EMAIL`/`TEST_PASSWORD` env vars — see `utils/secrets.ts`.
 *
 * Previously this fell back to a hardcoded `CI_test@kkday.com` /
 * `KKday1234567890!` literal in the repo; that ship has sailed —
 * credentials live in the secret service now.
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

    const { email, password } = await getTestCredentials();

    await page.fill('input[type="email"], input[type="text"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    // Wait until the password field disappears (redirect to app root)
    await page.waitForFunction(
        () => !document.querySelector('input[type="password"]'),
        { timeout: 10_000 },
    );
}
