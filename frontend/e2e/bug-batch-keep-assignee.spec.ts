import { test, expect } from '@playwright/test';
import { ensureLoggedIn, canWrite, TEST_RUN_ID } from './utils';

/**
 * Regression for the 2026-06-02 batch-apply bug:
 *
 *   Selecting rows and changing only the Batch Status to Blocked (leaving
 *   Batch Assignee on "— Keep —") used to silently send `assignee_id: null`
 *   to PUT /api/v1/results/{id}, wiping the existing assignee on every
 *   selected row. The "Keep" option in the UI implied "do not touch
 *   assignee_id", but handleBatchApply's guard `batchAssigneeId !==
 *   undefined` was always true (initial state is '', not undefined), so
 *   the null fell through.
 *
 * The fix routes the dropdown's three values explicitly:
 *   ''             → omit assignee_id from payload (true "Keep")
 *   '__unassign__' → send null
 *   '<userId>'     → send Number(userId)
 *
 * This spec intercepts the PUT and asserts the body for the Keep path —
 * no DB mutation needed.
 */

test('batch apply with status only does not include assignee_id (keeps the existing assignee)', async ({ page }) => {
    const { role } = await ensureLoggedIn(page);
    test.skip(!canWrite(role), 'batch apply requires Admin/QA');

    // We intercept and fulfill the PUT so the test doesn't actually mutate
    // SIT data — we only care about what the *frontend* sent.
    const sentPayloads: any[] = [];
    await page.route('**/api/v1/results/*', async route => {
        if (route.request().method() === 'PUT') {
            sentPayloads.push(await route.request().postDataJSON());
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true }),
            });
            return;
        }
        await route.continue();
    });

    await page.goto(`/runs/${TEST_RUN_ID}`);
    await page.waitForSelector('tbody tr', { timeout: 10_000 });

    // Select the first row via its checkbox. tbody tr td:first-child is the
    // selection column per the table layout.
    const firstRowCheckbox = page.locator('tbody tr').first().locator('input[type="checkbox"]');
    await expect(firstRowCheckbox).toBeVisible();
    await firstRowCheckbox.check();

    // Batch toolbar appears once a row is selected.
    const batchBar = page.locator('text=selected').first();
    await expect(batchBar).toBeVisible();

    // Status dropdown lives next to "Status:" label; pick Blocked. Leave the
    // Assignee dropdown on its default "— Keep —" (value '').
    const statusGroup = page.locator('div').filter({ hasText: /^Status:/ }).first();
    await statusGroup.locator('select').selectOption('Blocked');

    await page.click('button:has-text("Apply")');

    // PUT should have fired with status=Blocked AND no assignee_id at all.
    await expect.poll(() => sentPayloads.length, { timeout: 5_000 }).toBeGreaterThan(0);
    const first = sentPayloads[0];
    expect(first.status).toBe('Blocked');
    expect(first).not.toHaveProperty('assignee_id');
});

test('batch apply with explicit Unassign DOES send assignee_id: null', async ({ page }) => {
    const { role } = await ensureLoggedIn(page);
    test.skip(!canWrite(role), 'batch apply requires Admin/QA');

    const sentPayloads: any[] = [];
    await page.route('**/api/v1/results/*', async route => {
        if (route.request().method() === 'PUT') {
            sentPayloads.push(await route.request().postDataJSON());
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true }),
            });
            return;
        }
        await route.continue();
    });

    await page.goto(`/runs/${TEST_RUN_ID}`);
    await page.waitForSelector('tbody tr', { timeout: 10_000 });

    const firstRowCheckbox = page.locator('tbody tr').first().locator('input[type="checkbox"]');
    await firstRowCheckbox.check();

    const assigneeGroup = page.locator('div').filter({ hasText: /^Assign to:/ }).first();
    await assigneeGroup.locator('select').selectOption('__unassign__');

    await page.click('button:has-text("Apply")');

    await expect.poll(() => sentPayloads.length, { timeout: 5_000 }).toBeGreaterThan(0);
    const first = sentPayloads[0];
    expect(first.assignee_id).toBeNull();
});
