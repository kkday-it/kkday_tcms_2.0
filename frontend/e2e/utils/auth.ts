import type { Page } from '@playwright/test';
import { getTestCredentials } from './secrets';

/** Roles that may write/delete TCMS resources (matches frontend canWrite()). */
const WRITABLE_ROLES = new Set(['Admin', 'QA']);

/** Read the cached role from localStorage (after a successful login). */
async function readRole(page: Page): Promise<string | null> {
    return page.evaluate(() => {
        try {
            const raw = localStorage.getItem('tcms_user');
            if (!raw) return null;
            return (JSON.parse(raw)?.role as string) ?? null;
        } catch {
            return null;
        }
    });
}

/**
 * Ensure the current page session is authenticated.
 *
 * Checks for a password input to detect the login screen; if found, fills
 * credentials from `getTestCredentials()` and submits. Credentials come
 * from the secret service (`production/TCMS/TCMS_email`) or
 * `TEST_EMAIL`/`TEST_PASSWORD` env vars — see `utils/secrets.ts`. The
 * hardcoded `CI_test@kkday.com` / `KKday1234567890!` literal that used
 * to live here is gone (PR #818).
 *
 * Returns the logged-in user's role so the caller can `test.skip(...)` when
 * a write-only test happens to be running under a read-only account.
 *
 * Call at the start of every authenticated test:
 *
 *   const { role } = await ensureLoggedIn(page);
 *   test.skip(!canWrite(role), 'needs Admin/QA');
 */
export async function ensureLoggedIn(page: Page): Promise<{ role: string | null }> {
    await page.goto('/');
    const isLoginPage = await page
        .locator('input[type="password"]')
        .isVisible({ timeout: 3000 })
        .catch(() => false);

    if (isLoginPage) {
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

    return { role: await readRole(page) };
}

/** True if the current test session can perform writes (PR-3 canWrite). */
export function canWrite(role: string | null): boolean {
    return role !== null && WRITABLE_ROLES.has(role);
}
