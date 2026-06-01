import type { Page } from '@playwright/test';

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
 * credentials from environment variables and submits. Credentials fall back
 * to the shared CI test account (low-privilege Tester, safe to commit).
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

    return { role: await readRole(page) };
}

/** True if the current test session can perform writes (PR-3 canWrite). */
export function canWrite(role: string | null): boolean {
    return role !== null && WRITABLE_ROLES.has(role);
}
