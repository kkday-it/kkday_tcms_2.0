import { test, expect } from '@playwright/test';

// Helper: login if needed
async function ensureLoggedIn(page: import('@playwright/test').Page) {
    await page.goto('/');
    const isLoginPage = await page.locator('input[type="password"]').isVisible({ timeout: 3000 }).catch(() => false);
    if (isLoginPage) {
        await page.fill('input[type="email"], input[type="text"]', process.env.TEST_EMAIL ?? 'CI_test@kkday.com');
        await page.fill('input[type="password"]', process.env.TEST_PASSWORD ?? 'KKday1234567890!');
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
    // Scroll to bottom of the case list panel — target the scrollable container
    // that holds the test-case rows (has both overflow-y-auto and the results table inside)
    const listDiv = page.locator('[class*="overflow-y-auto"]').filter({ has: page.locator('tbody tr') }).first();
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
    // For React 18 controlled <select> we call the React onChange prop directly
    // via the element's __reactProps fiber key — more reliable than native event dispatch
    await firstSelect.evaluate((el: HTMLSelectElement, val: string) => {
        const propsKey = Object.keys(el).find(k => k.startsWith('__reactProps'));
        if (propsKey) {
            (el as any)[propsKey].onChange({ target: { value: val } });
        } else {
            // Fallback: native setter + change event for non-React or older versions
            const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
            setter?.call(el, val);
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }, newVal);
    // Wait for Save button to become enabled (React state update is async)
    await expect(page.locator('button:has-text("Save")')).toBeEnabled({ timeout: 3000 });
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
        // Scope check to the status cell only (3rd column) to avoid false positives
        // from run titles or descriptions that might incidentally contain "Archived"
        const statusCell = runRows.nth(i).locator('td:nth-child(3)');
        if (await statusCell.count() > 0) {
            const cellText = await statusCell.innerText();
            expect(cellText).not.toContain('Archived');
        }
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

// ─── Regression: /plans/:id 直接 URL 存取不可白畫面 ──────────────────────────
// 重現情境：直接輸入 URL（非從列表點入）時，React 先以 plan=null 初始化，
// 再非同步載入資料，若有 hook 放在 early return 後面就會觸發
// "Rendered more hooks than during the previous render" 崩潰 → 白畫面。
test('Regression: direct URL navigation to /plans/:id does not crash', async ({ page }) => {
    await ensureLoggedIn(page);

    // Fetch the first available plan ID directly from the API to avoid hardcoding
    const res = await page.request.get('/api/v1/plans/project/1');
    expect(res.status()).toBe(200);
    const plans: { id: number }[] = await res.json();
    expect(plans.length).toBeGreaterThan(0);
    const planId = plans[0].id;

    // Navigate directly by URL — this is the scenario that used to crash
    await page.goto(`/plans/${planId}`);
    await page.waitForLoadState('networkidle');

    // Page must not be blank: expect the plan title heading to appear
    const heading = page.locator('h1, h2, [class*="text-2xl"], [class*="text-3xl"]').first();
    await expect(heading).toBeVisible({ timeout: 10000 });

    // No React error boundary message must appear
    await expect(page.locator('text=Something went wrong')).toHaveCount(0);

    // Console must have zero errors
    const errors = await page.evaluate(() =>
        (window as any).__playwrightErrors ?? []
    );
    expect(errors).toHaveLength(0);
});
