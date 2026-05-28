import { test, expect, type Page } from '@playwright/test';
import { ensureLoggedIn } from './utils';

// PR-805 ExportCasesModal coverage — per test-impact reviewer's request.
// Strategy: drive the UI through stable role/text locators, then intercept the
// outgoing `/cases/export` request and assert the URL params (project_id,
// format, optional suite_id) without needing the response to actually finish.
// This sidesteps the locator-fragility complaint about the earlier hover-based
// spec by relying on aria roles + the new modal's clear labels.

async function openExportModal(page: Page) {
    // Two possible entry points (empty-state card vs. suite-view header). Either
    // shows "匯出測試案例" / "匯出" — pick whichever is visible.
    const primary = page.getByRole('button', { name: /匯出測試案例|^匯出$/ }).first();
    await expect(primary).toBeVisible({ timeout: 5000 });
    await primary.click();
    await expect(page.getByRole('heading', { name: '匯出測試案例' })).toBeVisible({ timeout: 3000 });
}

/**
 * Click the radio whose label starts with the given prefix. The radio sits inside
 * a `<label>` that contains the text — using `locator('label', { hasText })` keeps
 * the locator independent of internal markup.
 */
async function pickScopeRadio(page: Page, prefix: string) {
    const lbl = page.locator('label', { hasText: prefix }).first();
    await expect(lbl).toBeVisible();
    await lbl.click();
}

function pickFormat(page: Page, label: string) {
    return page.getByRole('button', { name: new RegExp(`^${label}`) }).first().click();
}

/**
 * Click "開始匯出" and capture the URL of the export request. The request will be
 * aborted (we don't need to wait for the multi-MB download to finish — just to
 * verify the params we send).
 */
async function captureExportRequestUrl(page: Page): Promise<string> {
    let aborted = false;
    await page.route('**/cases/export*', async (route) => {
        aborted = true;
        await route.abort();
    });
    const reqPromise = page.waitForRequest((r) => r.url().includes('/cases/export'), { timeout: 5000 });
    await page.getByRole('button', { name: /開始匯出/ }).click();
    const req = await reqPromise;
    expect(aborted, 'export request should have been intercepted').toBe(true);
    return req.url();
}

test('Scope "全部" — request omits suite_id', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto('/repository');
    await page.waitForLoadState('networkidle');

    await openExportModal(page);
    await pickScopeRadio(page, '全部測試案例');
    await pickFormat(page, 'CSV');

    const url = await captureExportRequestUrl(page);
    const qs = new URL(url).searchParams;
    expect(qs.get('project_id')).toBe('1');
    expect(qs.get('format')).toBe('csv');
    expect(qs.get('suite_id'), '"all" scope must NOT carry suite_id').toBeNull();
});

test('Scope "目前資料夾" — request carries the active suite_id', async ({ page, request }) => {
    await ensureLoggedIn(page);

    // Bootstrap activeSuiteId via Repository's `?suite=<id>` deep-link rather
    // than navigating the sidebar — the sidebar markup is render-implementation
    // detail, while the URL param is a stable contract used by other linking flows.
    const suitesRes = await request.get('/api/v1/suites/project/1');
    test.skip(suitesRes.status() !== 200, 'suites API unavailable');
    const suites: { id: number; name: string }[] = await suitesRes.json();
    test.skip(suites.length === 0, 'no suites in target env');
    const target = suites[0];

    await page.goto(`/repository?suite=${target.id}`);
    await page.waitForLoadState('networkidle');

    await openExportModal(page);
    await pickScopeRadio(page, '目前資料夾');
    await pickFormat(page, 'JSON');

    const url = await captureExportRequestUrl(page);
    const qs = new URL(url).searchParams;
    expect(qs.get('project_id')).toBe('1');
    expect(qs.get('format')).toBe('json');
    expect(qs.get('suite_id'), 'scope=active must carry the active suite').toBe(String(target.id));
});

test('Scope "指定資料夾" — request carries the picked suite_id (AI JSON format)', async ({ page, request }) => {
    await ensureLoggedIn(page);
    await page.goto('/repository');
    await page.waitForLoadState('networkidle');

    const suitesRes = await request.get('/api/v1/suites/project/1');
    test.skip(suitesRes.status() !== 200, 'suites API unavailable');
    const suites: { id: number; name: string }[] = await suitesRes.json();
    test.skip(suites.length === 0, 'no suites in target env');
    const picked = suites[suites.length - 1]; // last one to vary from the "active" test above

    await openExportModal(page);
    await pickScopeRadio(page, '指定資料夾');

    // react-select hides its real input behind aria — type into the visible
    // combobox via keyboard, then commit the highlighted option with Enter.
    const combobox = page.getByRole('combobox', { name: 'Pick suite to export' });
    await expect(combobox).toBeVisible({ timeout: 3000 });
    await combobox.focus();
    await page.keyboard.type(picked.name, { delay: 20 });
    await page.keyboard.press('Enter');

    await pickFormat(page, 'AI JSON');
    const url = await captureExportRequestUrl(page);
    const qs = new URL(url).searchParams;
    expect(qs.get('project_id')).toBe('1');
    expect(qs.get('format')).toBe('ai_json');
    expect(qs.get('suite_id')).toBe(String(picked.id));
});
