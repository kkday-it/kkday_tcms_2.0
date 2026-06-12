import { test, expect } from '@playwright/test';
import { ensureLoggedIn, canWrite } from './utils';

type CaseRow = {
    id: number;
    suite_id?: number | null;
    external_id?: string | null;
    labels?: string | null;
};

// The UI now shows the KQT external_id and hides the internal TC-{id}
// (mirrors frontend lib/caseLabel.ts). Fall back to TC-{id} when a case has
// no external_id so assertions match exactly what's rendered.
const caseLabel = (c: { external_id?: string | null; id: number }): string =>
    c.external_id?.trim() ? c.external_id.trim() : `TC-${c.id}`;

// Pull the first case from the API so tests don't hardcode an id that may not
// exist in the target env. Mirrors the pattern used in the /plans regression
// test at the bottom of kqt14156.spec.ts.
async function pickFirstCase(page: import('@playwright/test').Page): Promise<CaseRow | null> {
    const res = await page.request.get('/api/v1/cases/project/1');
    if (res.status() !== 200) return null;
    const cases: CaseRow[] = await res.json();
    return cases[0] ?? null;
}

async function pickRunWithMultipleCases(page: import('@playwright/test').Page) {
    const res = await page.request.get('/api/v1/runs/project/1');
    if (res.status() !== 200) return null;
    const runs: { id: number; total?: number }[] = await res.json();
    return runs.find(r => (r.total ?? 0) >= 2) ?? null;
}

/**
 * Open Repository scoped to a specific suite (or the project's first when
 * none specified), exercising the `?suite=<id>` deep-link Repository.tsx
 * already supports. We can't rely on a sidebar text selector (suite names
 * in SIT are Chinese / project-specific and historically the e2e tried to
 * match the literal word "Suite"); driving via URL keeps the test stable.
 *
 * Pass the target case's `suite_id` when the test needs that specific case
 * to be visible — Repository only renders rows from the active suite.
 *
 * Returns `null` if the project has no suites — caller should `test.skip`.
 */
async function gotoRepositorySuite(
    page: import('@playwright/test').Page,
    suiteId?: number | null,
): Promise<number | null> {
    let target = suiteId ?? null;
    if (target == null) {
        const res = await page.request.get('/api/v1/suites/project/1');
        if (res.status() !== 200) return null;
        const suites: { id: number }[] = await res.json();
        if (!suites.length) return null;
        target = suites[0].id;
    }
    await page.goto(`/repository?suite=${target}`);
    await page.waitForLoadState('networkidle');
    return target;
}

// ─── KQT-15250: 案例庫搜尋支援 TC- 編號 ──────────────────────────────────────
test('KQT-15250: 案例庫輸入 "TC-{id}" 可命中對應 case', async ({ page }) => {
    await ensureLoggedIn(page);

    const sample = await pickFirstCase(page);
    test.skip(!sample, 'no cases in target env');
    const targetId = sample!.id;

    // Open the suite that actually contains `sample` — Repository only
    // renders rows from the active suite, so generic "first suite" would
    // hide the row we want to assert on.
    const suiteId = await gotoRepositorySuite(page, sample!.suite_id ?? null);
    test.skip(!suiteId, 'no suites in target env');

    const searchInput = page.locator('input[placeholder*="搜尋案例"]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill(`TC-${targetId}`);

    // Search still accepts the TC-{id} keyword; the row now renders the KQT
    // external_id label, so assert against that.
    await expect(page.locator(`text=${caseLabel(sample!)}`).first()).toBeVisible({ timeout: 3000 });

    // And the per-suite header reflects the narrowed result set.
    const countHeader = page.locator('text=/\\d+ test cases in this suite/');
    await expect(countHeader.first()).toBeVisible();
});

// ─── KQT-15250 (extended): 描述 / labels / tags 也可搜尋 ─────────────────────
test('KQT-15250 extended: 用 labels 內容能搜到 case', async ({ page }) => {
    await ensureLoggedIn(page);

    // Find a case whose labels field carries something searchable.
    const res = await page.request.get('/api/v1/cases/project/1');
    test.skip(res.status() !== 200, 'cases API unavailable');
    const cases: CaseRow[] = await res.json();
    const withLabel = cases.find(c => c.labels && c.labels.trim().length > 1);
    test.skip(!withLabel, 'no case with labels in target env');

    // Pull the first whitespace/comma-delimited token so the keyword is
    // narrow enough to act as a real filter.
    const token = withLabel!.labels!.split(/[\s,]+/).find(t => t.length >= 3);
    test.skip(!token, 'labels field has no usable token');

    // Activate the suite that owns `withLabel` so the row will actually be in
    // the listing once the search narrows.
    const suiteId = await gotoRepositorySuite(page, withLabel!.suite_id ?? null);
    test.skip(!suiteId, 'no suites in target env');

    const searchInput = page.locator('input[placeholder*="搜尋案例"]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill(token!);

    await expect(page.locator(`text=${caseLabel(withLabel!)}`).first()).toBeVisible({ timeout: 3000 });
});

// ─── KQT-15251: Test Run case 列表依 case_id 升冪排序 ────────────────────────
test('KQT-15251: Test Run case 列表依 TC 編號由小到大', async ({ page }) => {
    await ensureLoggedIn(page);

    const run = await pickRunWithMultipleCases(page);
    test.skip(!run, 'no run with >= 2 cases in target env');

    await page.goto(`/runs/${run!.id}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('tbody tr', { timeout: 10000 });

    // Read the internal case_id from the row's data-case-id attribute rather
    // than the visible label: the UI now shows the KQT external_id, whose
    // number is NOT order-equivalent to case_id (Zephyr keys are small, backfilled
    // ones are 50000+id), so parsing the label would misjudge the ordering.
    const ids = await page
        .locator('tbody tr td:nth-child(2) span.font-mono[data-case-id]')
        .evaluateAll(els => els.map(e => Number(e.getAttribute('data-case-id'))));
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(ids.every(n => Number.isFinite(n))).toBe(true);

    for (let i = 1; i < ids.length; i++) {
        expect(ids[i]).toBeGreaterThanOrEqual(ids[i - 1]);
    }
});

// ─── external_id badge: Test Run case 詳細 pane ──────────────────────────────
test('external_id badge: 點 Test Run 內 case 時詳細 pane 顯示 external_id', async ({ page }) => {
    await ensureLoggedIn(page);

    const res = await page.request.get('/api/v1/runs/project/1');
    test.skip(res.status() !== 200, 'runs API unavailable');
    const runs: { id: number; total?: number }[] = await res.json();

    // Find a run whose first result has an external_id, otherwise this test
    // would compare against an empty value and report a false pass.
    let runId: number | null = null;
    let expectedExtId: string | null = null;
    for (const r of runs) {
        if ((r.total ?? 0) < 1) continue;
        const resultsRes = await page.request.get(`/api/v1/results/run/${r.id}`);
        if (resultsRes.status() !== 200) continue;
        const results: { id: number; case_id: number; test_case?: { external_id?: string } }[] = await resultsRes.json();
        const hit = results.find(x => x.test_case?.external_id);
        if (hit) {
            runId = r.id;
            expectedExtId = hit.test_case!.external_id!;
            break;
        }
    }
    test.skip(runId === null, 'no run-result with external_id available');

    await page.goto(`/runs/${runId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('tbody tr', { timeout: 10000 });

    // Click the row whose external_id badge matches; rows render external_id
    // alongside the TC- label inside the title cell.
    const targetRow = page.locator('tbody tr').filter({ hasText: expectedExtId! }).first();
    await expect(targetRow).toBeVisible();
    await targetRow.click();

    // Detail pane should show the external_id. Wait for a case-id row marker first.
    await page.waitForSelector('span.font-mono[data-case-id]', { timeout: 5000 });
    const badge = page.locator(`text=${expectedExtId}`);
    await expect(badge.first()).toBeVisible();
});

// ─── external_id badge: 編輯 case modal header ───────────────────────────────
test('external_id badge: 編輯 case 時 modal header 顯示 external_id', async ({ page }) => {
    const { role } = await ensureLoggedIn(page);
    // PR-3 RBAC: only Admin/QA see the 編輯 button on the preview pane;
    // running this under a Tester would loop on a missing button.
    test.skip(!canWrite(role), '編輯 case requires Admin/QA');

    const res = await page.request.get('/api/v1/cases/project/1');
    test.skip(res.status() !== 200, 'cases API unavailable');
    const cases: CaseRow[] = await res.json();
    const target = cases.find(c => c.external_id && c.external_id.trim().length > 0);
    test.skip(!target, 'no case with external_id in target env');

    // The target case may live in a non-first suite — open its actual suite.
    const suiteId = await gotoRepositorySuite(page, target!.suite_id ?? null);
    test.skip(!suiteId, 'no suites in target env');

    // Use the search input we just verified to scope to the target case.
    const searchInput = page.locator('input[placeholder*="搜尋案例"]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill(`TC-${target!.id}`);

    const row = page.locator('tbody tr, [class*="cursor-pointer"]').filter({ hasText: caseLabel(target!) }).first();
    await expect(row).toBeVisible();
    await row.click();

    // Clicking the row opens the preview pane; we need the 編輯 button to
    // launch the editor modal whose header is under test.
    const editBtn = page.locator('button:has-text("編輯")').first();
    await expect(editBtn).toBeVisible({ timeout: 5000 });
    await editBtn.click();

    // Editor opens — header now shows "編輯 {external_id}" (TC-{id} hidden).
    const heading = page.locator(`h2:has-text("編輯 ${caseLabel(target!)}")`);
    await expect(heading).toBeVisible({ timeout: 5000 });
});

// ─── TestRuns: 新搜尋框可實際過濾 Run 列表 ───────────────────────────────────
test('TestRuns 搜尋框輸入 Run title 可過濾列表', async ({ page }) => {
    await ensureLoggedIn(page);

    const res = await page.request.get('/api/v1/runs/project/1');
    test.skip(res.status() !== 200, 'runs API unavailable');
    const runs: { id: number; title: string }[] = await res.json();
    test.skip(runs.length < 1, 'no runs in target env');

    // Pick a token from the first run's title — at least 3 chars to avoid
    // matching too broadly.
    const token = runs[0].title.split(/\s+/).find(s => s.length >= 3) ?? runs[0].title.slice(0, 4);

    await page.goto('/runs');
    await page.waitForLoadState('networkidle');

    const searchInput = page.locator('input[placeholder*="搜尋 Run"]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill(token);

    // The first run's title must remain visible (it contains the token).
    await expect(page.locator(`text=${runs[0].title}`).first()).toBeVisible({ timeout: 3000 });

    // Clear button (X icon) is rendered while query is non-empty — clicking
    // it must wipe the field.
    const clearBtn = page.locator('button[aria-label="清除搜尋"]').first();
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await expect(searchInput).toHaveValue('');
});

// ─── TestPlans: 新搜尋框可實際過濾 Plan 列表 ─────────────────────────────────
test('TestPlans 搜尋框輸入 Plan title 可過濾列表', async ({ page }) => {
    await ensureLoggedIn(page);

    const res = await page.request.get('/api/v1/plans/project/1');
    test.skip(res.status() !== 200, 'plans API unavailable');
    const plans: { id: number; title: string }[] = await res.json();
    test.skip(plans.length < 1, 'no plans in target env');

    const token = plans[0].title.split(/\s+/).find(s => s.length >= 3) ?? plans[0].title.slice(0, 4);

    await page.goto('/plans');
    await page.waitForLoadState('networkidle');

    const searchInput = page.locator('input[placeholder*="搜尋計畫"]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill(token);

    await expect(page.locator(`text=${plans[0].title}`).first()).toBeVisible({ timeout: 3000 });

    const clearBtn = page.locator('button[aria-label="清除搜尋"]').first();
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await expect(searchInput).toHaveValue('');
});
