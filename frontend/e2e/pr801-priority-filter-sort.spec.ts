import { test, expect, type Page } from '@playwright/test';
import { ensureLoggedIn } from './utils';

// Canonical severity order (Critical→Not Set). Mirrors PRIORITY_OPTIONS /
// priorityRank in TestRunDetails.tsx; smaller rank == higher severity, matching
// the "Priority High → Low" display direction.
const PRIORITY_RANK: Record<string, number> = {
    Critical: 0, High: 1, Medium: 2, Low: 3, 'Not Set': 4,
};

/**
 * Find a run that has at least two distinct priorities among its results.
 * Returns the run id + the set of priorities seen. Pulled via API so tests
 * don't hardcode an id that may not exist in the target env (mirrors the
 * pattern in kqt-15250-15251.spec.ts).
 */
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

/** Find a run that has at least one row with an assignee (for mutual-exclusion tests). */
async function pickRunWithAssignee(page: Page) {
    const runsRes = await page.request.get('/api/v1/runs/project/1');
    if (runsRes.status() !== 200) return null;
    const runs: { id: number; total?: number }[] = await runsRes.json();
    for (const r of runs) {
        if ((r.total ?? 0) < 1) continue;
        const resultsRes = await page.request.get(`/api/v1/results/run/${r.id}`);
        if (resultsRes.status() !== 200) continue;
        const results: { assignee_id?: number | null }[] = await resultsRes.json();
        if (results.some(x => x.assignee_id != null)) return r.id;
    }
    return null;
}

/** Priority is the 3rd column (after the checkbox column and Case Title). */
function priorityCells(page: Page) {
    return page.locator('tbody tr td:nth-child(3)').allInnerTexts();
}

// ─── PR-801 Priority filter ──────────────────────────────────────────────────
test('PR-801: 點 priority pill 後, 剩下的列全部是該優先級', async ({ page }) => {
    await ensureLoggedIn(page);
    const target = await pickRunWithMixedPriorities(page);
    test.skip(!target, 'no run with mixed priorities in target env');

    await page.goto(`/runs/${target!.id}`);
    await page.waitForSelector('tbody tr', { timeout: 10_000 });

    const pick = target!.priorities[0];
    // exact: true so e.g. "High" doesn't also match "Highest" if labels ever change.
    await page.getByRole('button', { name: pick, exact: true }).first().click();

    const cells = await priorityCells(page);
    expect(cells.length).toBeGreaterThan(0);
    cells.forEach(c => expect(c.trim()).toBe(pick));
});

// ─── PR-801 Priority sort (desc) ─────────────────────────────────────────────
test('PR-801: sort "Priority High → Low" 後, canonical rank 非遞減', async ({ page }) => {
    await ensureLoggedIn(page);
    const target = await pickRunWithMixedPriorities(page);
    test.skip(!target, 'no run with mixed priorities in target env');

    await page.goto(`/runs/${target!.id}`);
    await page.waitForSelector('tbody tr', { timeout: 10_000 });

    await page.locator('select[title="Sort order"]').first().selectOption('priority-desc');

    const cells = await priorityCells(page);
    expect(cells.length).toBeGreaterThan(1);
    const ranks = cells.map(c => PRIORITY_RANK[c.trim()] ?? 99);
    for (let i = 1; i < ranks.length; i++) {
        // Higher severity (smaller rank) must come first → ranks are non-decreasing.
        expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
    }
});

// ─── KQT-15251 regression: default sort still asc by case_id ─────────────────
test('PR-801: 預設 sort 仍是 case_id 升冪 (KQT-15251 regression)', async ({ page }) => {
    await ensureLoggedIn(page);
    const target = await pickRunWithMixedPriorities(page);
    test.skip(!target, 'no run with mixed priorities in target env');

    await page.goto(`/runs/${target!.id}`);
    await page.waitForSelector('tbody tr', { timeout: 10_000 });

    // Don't touch the sort dropdown — it should default to case-asc.
    const labels = await page.locator('tbody tr td:nth-child(2) span.font-mono').allInnerTexts();
    const ids = labels.map(s => s.match(/TC-(\d+)/)?.[1]).filter((v): v is string => !!v).map(Number);
    expect(ids.length).toBeGreaterThan(1);
    for (let i = 1; i < ids.length; i++) {
        expect(ids[i]).toBeGreaterThanOrEqual(ids[i - 1]);
    }
});

// ─── Assignee filter mutual exclusion: forward (select → clears toggles) ────
test('PR-801: 選指定 assignee 會清空 "Assign to me" / "Unassigned" 兩個 toggle', async ({ page }) => {
    await ensureLoggedIn(page);
    const runId = await pickRunWithAssignee(page);
    test.skip(!runId, 'no run with assigned cases in target env');

    await page.goto(`/runs/${runId}`);
    await page.waitForSelector('tbody tr', { timeout: 10_000 });

    // Turn on "Assign to me" first so we can witness the dropdown clearing it.
    const assignToMe = page.getByRole('checkbox', { name: 'Assign to me' });
    await assignToMe.check();
    expect(await assignToMe.isChecked()).toBe(true);

    // Open the advanced panel; the assignee dropdown lives there.
    await page.getByRole('button', { name: /^More/ }).click();
    const assigneeSelect = page.locator('select:has(option:text-is("Any assignee"))').first();
    // Pick the first concrete assignee option (skip the empty "" / Any assignee).
    const concreteValues = await assigneeSelect.locator('option').evaluateAll(opts =>
        (opts as HTMLOptionElement[]).map(o => o.value).filter(v => v !== ''));
    test.skip(concreteValues.length === 0, 'run has assignees in DB but dropdown rendered empty');
    await assigneeSelect.selectOption(concreteValues[0]);

    expect(await assignToMe.isChecked()).toBe(false);
    expect(await page.getByRole('checkbox', { name: 'Unassigned' }).isChecked()).toBe(false);
});

// ─── Assignee filter mutual exclusion: reverse (toggle → clears select) ─────
// Regression for the code-review fix: prior version only enforced one direction,
// letting both filters AND-silently and produce empty result sets.
test('PR-801: 勾 "Assign to me" 後, 指定 assignee 下拉自動歸零', async ({ page }) => {
    await ensureLoggedIn(page);
    const runId = await pickRunWithAssignee(page);
    test.skip(!runId, 'no run with assigned cases in target env');

    await page.goto(`/runs/${runId}`);
    await page.waitForSelector('tbody tr', { timeout: 10_000 });

    await page.getByRole('button', { name: /^More/ }).click();
    const assigneeSelect = page.locator('select:has(option:text-is("Any assignee"))').first();
    const concreteValues = await assigneeSelect.locator('option').evaluateAll(opts =>
        (opts as HTMLOptionElement[]).map(o => o.value).filter(v => v !== ''));
    test.skip(concreteValues.length === 0, 'run has assignees in DB but dropdown rendered empty');

    // Set a specific assignee first, then witness the toggle clearing it.
    await assigneeSelect.selectOption(concreteValues[0]);
    await expect(assigneeSelect).toHaveValue(concreteValues[0]);

    await page.getByRole('checkbox', { name: 'Assign to me' }).check();
    await expect(assigneeSelect).toHaveValue('');
});
