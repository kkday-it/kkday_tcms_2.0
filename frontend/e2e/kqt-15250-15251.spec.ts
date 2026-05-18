import { test, expect } from '@playwright/test';
import { ensureLoggedIn } from './utils';

// Pull the first case from the API so tests don't hardcode an id that may not
// exist in the target env. Mirrors the pattern used in the /plans regression
// test at the bottom of kqt14156.spec.ts.
async function pickFirstCase(page: import('@playwright/test').Page) {
    const res = await page.request.get('/api/v1/cases/project/1');
    if (res.status() !== 200) return null;
    const cases: { id: number; external_id?: string | null; labels?: string | null }[] = await res.json();
    return cases[0] ?? null;
}

async function pickRunWithMultipleCases(page: import('@playwright/test').Page) {
    const res = await page.request.get('/api/v1/runs/project/1');
    if (res.status() !== 200) return null;
    const runs: { id: number; total?: number }[] = await res.json();
    return runs.find(r => (r.total ?? 0) >= 2) ?? null;
}

// ─── KQT-15250: 案例庫搜尋支援 TC- 編號 ──────────────────────────────────────
test('KQT-15250: 案例庫輸入 "TC-{id}" 可命中對應 case', async ({ page }) => {
    await ensureLoggedIn(page);

    const sample = await pickFirstCase(page);
    test.skip(!sample, 'no cases in target env');
    const targetId = sample!.id;

    await page.goto('/repository');
    await page.waitForLoadState('networkidle');

    const searchInput = page.locator('input[placeholder*="搜尋案例"]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill(`TC-${targetId}`);

    // After filtering, the queried TC must still be present.
    await expect(page.locator(`text=TC-${targetId}`).first()).toBeVisible({ timeout: 3000 });

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
    const cases: { id: number; labels?: string | null }[] = await res.json();
    const withLabel = cases.find(c => c.labels && c.labels.trim().length > 1);
    test.skip(!withLabel, 'no case with labels in target env');

    // Pull the first whitespace/comma-delimited token so the keyword is
    // narrow enough to act as a real filter.
    const token = withLabel!.labels!.split(/[\s,]+/).find(t => t.length >= 3);
    test.skip(!token, 'labels field has no usable token');

    await page.goto('/repository');
    await page.waitForLoadState('networkidle');

    const searchInput = page.locator('input[placeholder*="搜尋案例"]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill(token!);

    await expect(page.locator(`text=TC-${withLabel!.id}`).first()).toBeVisible({ timeout: 3000 });
});

// ─── KQT-15251: Test Run case 列表依 case_id 升冪排序 ────────────────────────
test('KQT-15251: Test Run case 列表依 TC 編號由小到大', async ({ page }) => {
    await ensureLoggedIn(page);

    const run = await pickRunWithMultipleCases(page);
    test.skip(!run, 'no run with >= 2 cases in target env');

    await page.goto(`/runs/${run!.id}`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('tbody tr', { timeout: 10000 });

    // Each row's case-id badge — uses the same `.font-mono` marker that the
    // KQT-14496 stability test already relies on, so we know it's stable.
    const labels = await page.locator('tbody tr td:nth-child(2) span.font-mono').allInnerTexts();
    expect(labels.length).toBeGreaterThanOrEqual(2);

    const ids = labels
        .map(s => s.match(/TC-(\d+)/)?.[1])
        .filter((v): v is string => v != null)
        .map(Number);
    expect(ids.length).toBe(labels.length); // every row must have a parseable id

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

    // Detail pane should show the same external_id alongside TC-{case_id}.
    // Wait for the pane heading first.
    await page.waitForSelector('text=/^TC-\\d+/', { timeout: 5000 });
    const badge = page.locator(`text=${expectedExtId}`);
    await expect(badge.first()).toBeVisible();
});

// ─── external_id badge: 編輯 case modal header ───────────────────────────────
test('external_id badge: 編輯 case 時 modal header 顯示 external_id', async ({ page }) => {
    await ensureLoggedIn(page);

    const res = await page.request.get('/api/v1/cases/project/1');
    test.skip(res.status() !== 200, 'cases API unavailable');
    const cases: { id: number; external_id?: string | null }[] = await res.json();
    const target = cases.find(c => c.external_id && c.external_id.trim().length > 0);
    test.skip(!target, 'no case with external_id in target env');

    await page.goto('/repository');
    await page.waitForLoadState('networkidle');

    // Use the search input we just verified to scope to the target case.
    const searchInput = page.locator('input[placeholder*="搜尋案例"]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill(`TC-${target!.id}`);

    const row = page.locator('tbody tr, [class*="cursor-pointer"]').filter({ hasText: `TC-${target!.id}` }).first();
    await expect(row).toBeVisible();
    await row.click();

    // Editor opens — header now shows "編輯 TC-{id}" plus the external_id badge.
    const heading = page.locator(`h2:has-text("編輯 TC-${target!.id}")`);
    await expect(heading).toBeVisible({ timeout: 5000 });
    await expect(page.locator(`text=${target!.external_id}`).first()).toBeVisible();
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
