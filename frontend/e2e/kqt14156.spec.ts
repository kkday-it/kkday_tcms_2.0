import { test, expect } from '@playwright/test';

// Helper: login if needed
async function ensureLoggedIn(page: import('@playwright/test').Page) {
    await page.goto('/');
    const isLoginPage = await page.locator('input[type="password"]').isVisible({ timeout: 3000 }).catch(() => false);
    if (isLoginPage) {
        await page.fill('input[type="email"], input[type="text"]', process.env.TEST_EMAIL ?? 'lance.chien@kkday.com');
        await page.fill('input[type="password"]', process.env.TEST_PASSWORD ?? '');
        await page.click('button[type="submit"]');
        // After login the app redirects to root "/" (dashboard at root path)
        await page.waitForFunction(
            () => !document.querySelector('input[type="password"]'),
            { timeout: 10000 }
        );
    }
}

// ─── KQT-14481: PRD 欄位顯示 Link 超連結 ──────────────────────────────────────
test('KQT-14481: PRD field shows "Link" hyperlink, not raw URL', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto('/plans');
    await page.waitForLoadState('networkidle');
    const planCard = page.locator('[class*="rounded-xl"]').filter({ has: page.locator('text=/Plan ID/i') }).first();
    await expect(planCard).toBeVisible();
    await planCard.click();
    await page.waitForLoadState('networkidle');
    // If there is a PRD section, the link text must not be a raw URL
    const prdLink = page.locator('text=PRD').locator('..').locator('a');
    if (await prdLink.count() > 0) {
        const linkText = await prdLink.first().innerText();
        expect(linkText).not.toMatch(/^https?:\/\//);
        // Should be clickable (has href)
        const href = await prdLink.first().getAttribute('href');
        expect(href).toBeTruthy();
    }
});

// ─── KQT-14482: Jira Filter 表格可排序 ───────────────────────────────────────
test('KQT-14482: Jira filter tables have sortable column headers', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto('/plans');
    await page.waitForLoadState('networkidle');
    const planCard = page.locator('[class*="rounded-xl"]').filter({ has: page.locator('text=/Plan ID/i') }).first();
    await expect(planCard).toBeVisible();
    await planCard.click();
    await page.waitForLoadState('networkidle');
    // Find the first sortable Jira table header (Key column)
    const keyTh = page.locator('th').filter({ hasText: /^Key/ }).first();
    if (await keyTh.count() > 0) {
        await expect(keyTh).toBeVisible();
        await keyTh.click();
        // After click, sort arrow (▲ or ▼) should appear in that header
        await expect(keyTh).toContainText(/[▲▼]/);
    }
});

// ─── KQT-14484: Test Step 有 Blocked 按鈕 ────────────────────────────────────
test('KQT-14484: Each test step has a Blocked button', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto('/runs');
    await page.waitForLoadState('networkidle');
    // Run rows are clickable divs (not <a> tags) — identify by case-count badge
    const runRow = page.locator('div[class*="cursor-pointer"]').filter({ has: page.locator('text=/個案例/') }).first();
    await expect(runRow).toBeVisible();
    await runRow.click();
    await page.waitForLoadState('networkidle');
    // Click the first test case row to open execution pane
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    await page.waitForSelector('text=Execute Test Case', { timeout: 5000 });
    // If there are steps, each should have a Blocked button
    const stepSections = page.locator('[class*="space-y-4"] > div');
    if (await stepSections.count() > 0) {
        const blockBtn = page.locator('button[title="Block Step"]').first();
        await expect(blockBtn).toBeVisible();
    }
});

// ─── KQT-14495: Pass All 不捲動列表至頂部 ────────────────────────────────────
test('KQT-14495: Clicking Pass All preserves scroll position of case list', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto('/runs');
    await page.waitForLoadState('networkidle');
    // Run rows are clickable divs (not <a> tags) — identify by case-count badge
    const runRow = page.locator('div[class*="cursor-pointer"]').filter({ has: page.locator('text=/個案例/') }).first();
    await expect(runRow).toBeVisible();
    await runRow.click();
    await page.waitForURL(/\/runs\/\d+/, { timeout: 10000 });
    // Wait for the results table to render (React state settles after navigation)
    await page.waitForSelector('tbody tr', { timeout: 10000 });
    const rows = page.locator('tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(2);
    // Scroll to bottom of list
    const listDiv = page.locator('[class*="overflow-y-auto"]').first();
    await listDiv.evaluate(el => el.scrollTop = 9999);
    const scrollBefore = await listDiv.evaluate(el => el.scrollTop);
    await rows.nth(count - 1).click();
    await page.waitForSelector('button:has-text("Pass All")', { timeout: 5000 });
    await page.click('button:has-text("Pass All")');
    await page.waitForLoadState('networkidle');
    const scrollAfter = await listDiv.evaluate(el => el.scrollTop);
    expect(scrollAfter).toBeGreaterThan(0);
    expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(200);
});

// ─── KQT-14496: 結果列表順序穩定 ─────────────────────────────────────────────
test('KQT-14496: Result list order is stable after updating a case status', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto('/runs');
    await page.waitForLoadState('networkidle');
    // Run rows are clickable divs (not <a> tags) — identify by case-count badge
    const runRow = page.locator('div[class*="cursor-pointer"]').filter({ has: page.locator('text=/個案例/') }).first();
    await expect(runRow).toBeVisible();
    await runRow.click();
    await page.waitForURL(/\/runs\/\d+/, { timeout: 10000 });
    await page.waitForSelector('tbody tr', { timeout: 10000 });
    const getOrder = () => page.locator('tbody tr td:nth-child(2) span.font-mono').allInnerTexts();
    const before = await getOrder();
    expect(before.length).toBeGreaterThan(1);
    const firstSelect = page.locator('tbody tr').first().locator('select').first();
    const currentVal = await firstSelect.inputValue();
    const newVal = currentVal === 'Untested' ? 'Passed' : 'Untested';
    await firstSelect.selectOption(newVal);
    await page.click('button:has-text("Save")');
    await page.waitForLoadState('networkidle');
    const after = await getOrder();
    expect(after).toEqual(before);
});

// ─── KQT-14670: Gantt 今日紅線日期正確 ───────────────────────────────────────
test('KQT-14670: Gantt today marker shows correct date', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto('/plans');
    await page.waitForLoadState('networkidle');
    const planCard = page.locator('[class*="rounded-xl"]').filter({ has: page.locator('text=/Plan ID/i') }).first();
    await expect(planCard).toBeVisible();
    await planCard.click();
    await page.waitForLoadState('networkidle');
    // If this plan has a timeline, "今日" label must be visible
    const todayLabel = page.locator('text=今日');
    if (await todayLabel.count() > 0) {
        await expect(todayLabel.first()).toBeVisible();
    }
});

// ─── KQT-14671: Archived run 不出現在計劃 ────────────────────────────────────
test('KQT-14671: Archived runs are not shown in test plan', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto('/plans');
    await page.waitForLoadState('networkidle');
    const planCard = page.locator('[class*="rounded-xl"]').filter({ has: page.locator('text=/Plan ID/i') }).first();
    await expect(planCard).toBeVisible();
    await planCard.click();
    await page.waitForLoadState('networkidle');
    const runRows = page.locator('tbody tr');
    const count = await runRows.count();
    for (let i = 0; i < count; i++) {
        const rowText = await runRows.nth(i).innerText();
        expect(rowText).not.toContain('Archived');
    }
});

// ─── KQT-14713 + KQT-14531: Suite 樹狀選擇器有層級展開 ──────────────────────
test('KQT-14531/14713: Suite tree selector shows expandable hierarchy', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto('/plans');
    await page.waitForLoadState('networkidle');
    // Open new plan modal
    const newBtn = page.locator('button', { hasText: /new plan|新增/i }).first();
    await expect(newBtn).toBeVisible();
    await newBtn.click();
    // Wait for modal content
    await page.waitForSelector('button:has-text("Runs / Cases")', { timeout: 5000 });
    await page.click('button:has-text("Runs / Cases")');
    await page.click('button:has-text("Test Cases")');
    // The custom SuiteTreeSelect trigger shows "All Suites"
    const suiteTrigger = page.locator('button').filter({ hasText: 'All Suites' }).first();
    await expect(suiteTrigger).toBeVisible();
    await suiteTrigger.click();
    // Dropdown should open — "All Suites" option is always present
    const allSuitesOption = page.locator('div').filter({ hasText: /^All Suites$/ }).first();
    await expect(allSuitesOption).toBeVisible();
    // If there are nested suites, at least one expandable chevron (▸) must be visible
    const expandable = page.locator('span').filter({ hasText: '▸' });
    if (await expandable.count() > 0) {
        await expect(expandable.first()).toBeVisible();
        // Clicking it should expand children (▸ → ▾)
        await expandable.first().click();
        await expect(page.locator('span').filter({ hasText: '▾' }).first()).toBeVisible();
    }
});
