import { test, expect } from '@playwright/test';
import { ensureLoggedIn } from './utils';

// ─── PR #740 regression: 0-issue Jira filter renders empty-list table ────────
// Before #740 the front-end dropped any filter block whose backend response
// had `issues: []`, leaving the "Jira 問題" section heading with nothing below
// it — users saw a blank gap and assumed their filter was broken.
// This test asserts that a plan with a configured jira filter id whose Jira
// response is empty now renders the table shell + "此 filter 目前無匹配 issue".
test('PR #740: jira filter with zero issues renders empty-list table', async ({ page }) => {
    await ensureLoggedIn(page);

    // Find any plan on project 1 that has at least one jira filter id configured.
    type Plan = {
        id: number;
        jira_unfix_filter_id?: number | null;
        jira_total_filter_id?: number | null;
        jira_unfix_filter_ids?: number[] | null;
        jira_total_filter_ids?: number[] | null;
    };
    const res = await page.request.get('/api/v1/plans/project/1');
    expect(res.status()).toBe(200);
    const plans: Plan[] = await res.json();
    const target = plans.find(p =>
        p.jira_unfix_filter_id != null ||
        p.jira_total_filter_id != null ||
        (p.jira_unfix_filter_ids?.length ?? 0) > 0 ||
        (p.jira_total_filter_ids?.length ?? 0) > 0,
    );
    test.skip(!target, 'No plan with jira filter config on this env — empty-state path not reachable');

    // Force every jira filter fetch to return zero issues so we hit the new code path
    // deterministically, regardless of what the live Jira filter currently matches.
    await page.route('**/api/v1/plans/jira/filter/*/issues**', async route => {
        const m = route.request().url().match(/\/jira\/filter\/(\d+)\/issues/);
        const filter_id = m ? Number(m[1]) : 0;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                issues: [],
                filter_id,
                filter_name: `Mocked Filter ${filter_id}`,
                view_url: `https://kkday.atlassian.net/issues/?filter=${filter_id}`,
            }),
        });
    });

    await page.goto(`/plans/${target!.id}`);
    await page.waitForLoadState('networkidle');

    // "Jira 問題" section heading is still gated on the plan having filter ids,
    // not on the resolved blocks, so it must appear.
    await expect(page.locator('text=Jira 問題').first()).toBeVisible({ timeout: 10_000 });

    // At least one block must render the empty-state row.
    await expect(page.locator('text=此 filter 目前無匹配 issue').first()).toBeVisible();

    // The mocked filter name should appear in the block header (proves the block
    // was kept rather than dropped at buildBlocks).
    await expect(page.locator('text=/Mocked Filter \\d+/').first()).toBeVisible();
});
