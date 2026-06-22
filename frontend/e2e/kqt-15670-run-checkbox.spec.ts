import { test, expect } from '@playwright/test';
import { ensureLoggedIn } from './utils/auth';
import { TEST_RUN_ID } from './utils/fixtures';

/**
 * KQT-15670 — the run-execution page's left-hand row checkbox did nothing when
 * clicked: the <td> wrapper called toggleRow on click AND the <input> called it
 * on change, so a click on the checkbox toggled twice and cancelled out. The fix
 * leaves the toggle to the input's onChange only. This guards against a regression.
 */
test('KQT-15670: run-page row checkbox toggles on click', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto(`/runs/${TEST_RUN_ID}`);

    const checkbox = page.locator('table tbody tr td input[type="checkbox"]').first();
    await expect(checkbox).toBeVisible({ timeout: 20000 });

    // Starts unselected.
    await expect(checkbox).not.toBeChecked();
    // One click selects it (previously: double-toggle left it unchecked).
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    // Clicking again clears it.
    await checkbox.click();
    await expect(checkbox).not.toBeChecked();
});
