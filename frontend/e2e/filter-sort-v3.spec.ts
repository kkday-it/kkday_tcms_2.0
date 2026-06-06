import { test, expect, type Page } from '@playwright/test';
import { ensureLoggedIn } from './utils';

// ─── Spec filter-spec-v3 regressions ─────────────────────────────────────────
// Covers the rewrite that replaced PR #801: Result/Priority pill multi-select,
// column-header sort (cycling asc → desc → default), and URL sync. The old
// pr801-priority-filter-sort spec is gone because Sort dropdown and the
// 'Assign to me' / 'Unassigned' checkboxes don't exist anymore (they live
// inside the consolidated <select> now).

const PRIORITY_RANK: Record<string, number> = {
    Critical: 0, High: 1, Medium: 2, Low: 3, 'Not Set': 4,
};

async function pickRunWithMixedPriorities(page: Page) {
    const runsRes = await page.request.get('/api/v1/runs/project/1');
    if (runsRes.status() !== 200) return null;
    const runs: { id: number; total?: number }[] = await runsRes.json();
    for (const r of runs) {
        if ((r.total ?? 0) < 2) continue;
        const resultsRes = await page.request.get(`/api/v1/results/run/${r.id}`);
        if (resultsRes.status() !== 200) continue;
        const results: { test_case?: { priority?: string | null } }[] = await resultsRes.json();
        const priorities = new Set<string>(results.map(x => x.test_case?.priority || 'Not Set'));
        if (priorities.size >= 2) return { id: r.id, priorities: [...priorities] };
    }
    return null;
}

/** Priority column is the 3rd <td> (checkbox + Case Title preceded it). */
function priorityCells(page: Page) {
    return page.locator('tbody tr td:nth-child(3)').allInnerTexts();
}

// ─── Test run page ───────────────────────────────────────────────────────────

test('v3: 點 Priority pill 後, 剩下的列全部是該優先級', async ({ page }) => {
    await ensureLoggedIn(page);
    const target = await pickRunWithMixedPriorities(page);
    test.skip(!target, 'no run with mixed priorities in target env');

    await page.goto(`/runs/${target!.id}`);
    await page.waitForSelector('tbody tr', { timeout: 10_000 });

    // PillGroup renders each pill as a native <button aria-pressed>; the
    // `[aria-pressed]` qualifier disambiguates it from any incidental
    // <button> with the same label elsewhere on the page.
    const pick = target!.priorities[0];
    await page.locator('button[aria-pressed]').filter({ hasText: new RegExp(`^${pick}$`) }).first().click();
    await expect(page).toHaveURL(/[?&]priority=/);

    // React re-render after URL change isn't synchronous with the click await,
    // so poll until every visible row has the picked priority.
    await expect.poll(async () => {
        const cells = await priorityCells(page);
        if (cells.length === 0) return false;
        return cells.every(c => c.trim() === pick);
    }, { timeout: 5_000, message: `rows didn't converge to all-${pick}` }).toBe(true);
});

test('v3: aria-pressed reflects pill toggle state', async ({ page }) => {
    await ensureLoggedIn(page);
    const target = await pickRunWithMixedPriorities(page);
    test.skip(!target, 'no run with mixed priorities in target env');

    await page.goto(`/runs/${target!.id}`);
    await page.waitForSelector('tbody tr', { timeout: 10_000 });

    const pick = target!.priorities[0];
    const pill = page.locator('button[aria-pressed]').filter({ hasText: new RegExp(`^${pick}$`) }).first();
    await expect(pill).toHaveAttribute('aria-pressed', 'false');
    await pill.click();
    await expect(pill).toHaveAttribute('aria-pressed', 'true');
    // Clicking again toggles off (spec §4.4).
    await pill.click();
    await expect(pill).toHaveAttribute('aria-pressed', 'false');
});

test('v3: 點 Priority column header 兩次 → asc → desc, rank non-decreasing/non-increasing', async ({ page }) => {
    await ensureLoggedIn(page);
    const target = await pickRunWithMixedPriorities(page);
    test.skip(!target, 'no run with mixed priorities in target env');

    await page.goto(`/runs/${target!.id}`);
    await page.waitForSelector('tbody tr', { timeout: 10_000 });

    // Sortable headers wrap the label in a <button> inside a <th>. Pick by
    // aria-sort attribute on the <th> — only sortable headers have it, and
    // it disambiguates from the Priority pill (which has aria-pressed).
    const header = page.locator('th[aria-sort] button', { hasText: 'Priority' });
    await header.click();
    // Match URL ignoring : / %3A encoding so the test doesn't break on
    // Playwright/Chromium URL normalisation differences.
    await expect(page).toHaveURL(/[?&]sort=priority(:|%3A)asc/);

    // Poll until the order converges — React's re-sort isn't synchronous
    // with the click await + URL assertion, and the first paint can still
    // show the previous (case_id asc) order for a tick.
    const isNonDecreasing = (cells: string[]) => {
        const ranks = cells.map(c => PRIORITY_RANK[c.trim()] ?? 99);
        return ranks.length > 1 && ranks.every((r, i) => i === 0 || r >= ranks[i - 1]);
    };
    const isNonIncreasing = (cells: string[]) => {
        const ranks = cells.map(c => PRIORITY_RANK[c.trim()] ?? 99);
        return ranks.length > 1 && ranks.every((r, i) => i === 0 || r <= ranks[i - 1]);
    };

    await expect.poll(async () => isNonDecreasing(await priorityCells(page)), {
        timeout: 5_000, message: 'priority asc never settled',
    }).toBe(true);

    // Second click → desc (rank non-increasing).
    await header.click();
    await expect(page).toHaveURL(/[?&]sort=priority(:|%3A)desc/);

    await expect.poll(async () => isNonIncreasing(await priorityCells(page)), {
        timeout: 5_000, message: 'priority desc never settled',
    }).toBe(true);
});

test('v3: 預設 sort 仍是 case_id 升冪 (KQT-15251 regression)', async ({ page }) => {
    await ensureLoggedIn(page);
    const target = await pickRunWithMixedPriorities(page);
    test.skip(!target, 'no run with mixed priorities in target env');

    await page.goto(`/runs/${target!.id}`);
    await page.waitForSelector('tbody tr', { timeout: 10_000 });

    // No header clicked → URL has no ?sort=. Rows go by case_id asc.
    expect(page.url()).not.toMatch(/[?&]sort=/);

    const labels = await page.locator('tbody tr td:nth-child(2) span.font-mono').allInnerTexts();
    const ids = labels.map(s => s.match(/TC-(\d+)/)?.[1]).filter((v): v is string => !!v).map(Number);
    expect(ids.length).toBeGreaterThan(1);
    for (let i = 1; i < ids.length; i++) {
        expect(ids[i]).toBeGreaterThanOrEqual(ids[i - 1]);
    }
});

test('v3: URL ?priority=High&sort=priority:desc reload 保留 filter/sort', async ({ page }) => {
    await ensureLoggedIn(page);
    const target = await pickRunWithMixedPriorities(page);
    test.skip(!target, 'no run with mixed priorities in target env');

    // Synthesize the URL directly — simulates a paste-from-Slack scenario.
    const pick = target!.priorities[0];
    await page.goto(`/runs/${target!.id}?priority=${encodeURIComponent(pick)}&sort=priority:desc`);
    await page.waitForSelector('tbody tr', { timeout: 10_000 });

    // Pill reads "pressed", header reads "descending" — both reconstructed
    // from the URL on initial render.
    const pill = page.locator('button[aria-pressed]').filter({ hasText: new RegExp(`^${pick}$`) }).first();
    await expect(pill).toHaveAttribute('aria-pressed', 'true');

    const priorityHeader = page.locator('th[aria-sort="descending"]');
    await expect(priorityHeader).toHaveCount(1);
});

// ─── Test case (Repository) page ─────────────────────────────────────────────

test('v3: Repository — Priority pill 過濾 case', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto('/repository');
    // Wait for any case row to appear; if project has zero cases we skip.
    const firstCase = page.locator('text=/^TC-\\d+/').first();
    const hasCases = await firstCase.isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(!hasCases, 'project has no test cases — filter cannot be exercised');

    // Click the Priority pill "Medium" (every realistic env should have at
    // least one Medium case; if not, skip).
    const pill = page.locator('button[aria-pressed]').filter({ hasText: /^Medium$/ }).first();
    if (!(await pill.isVisible().catch(() => false))) test.skip(true, 'no Medium pill rendered');

    await pill.click();
    await expect(page).toHaveURL(/[?&]priority=Medium/);
});

// ─── Sidebar ─────────────────────────────────────────────────────────────────

test('v3: Sidebar — aria-current="page" 跟著路由切換', async ({ page }) => {
    await ensureLoggedIn(page);

    await page.goto('/repository');
    // The nav link to 案例庫 should be marked aria-current="page".
    const repoLink = page.locator('a[aria-current="page"]', { hasText: '案例庫' });
    await expect(repoLink).toBeVisible();

    await page.goto('/runs');
    const runsLink = page.locator('a[aria-current="page"]', { hasText: '測試執行' });
    await expect(runsLink).toBeVisible();
});
