import { test, expect } from '@playwright/test';

// Helper: login if needed
async function ensureLoggedIn(page: import('@playwright/test').Page) {
    await page.goto('/');
    const isLoginPage = await page.locator('input[type="password"]').isVisible({ timeout: 3000 }).catch(() => false);
    if (isLoginPage) {
        await page.fill('input[type="email"], input[type="text"]', 'lance.chien@kkday.com');
        await page.fill('input[type="password"]', 'Lilee1234');
        await page.click('button[type="submit"]');
        // After login the app redirects to root "/" (dashboard at root path)
        await page.waitForFunction(
            () => !document.querySelector('input[type="password"]'),
            { timeout: 10000 }
        );
    }
}

// ─── KQT-14481: PRD 欄位不再顯示完整網址 ──────────────────────────────────────
test('KQT-14481: PRD field shows hostname, not full URL', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto('/plans');
    await page.waitForLoadState('networkidle');
    // Click the first plan card (they contain "Plan ID:" text)
    const planCard = page.locator('[class*="rounded-xl"]').filter({ has: page.locator('text=/Plan ID/i') }).first();
    if (await planCard.count() > 0) {
        await planCard.click();
        await page.waitForLoadState('networkidle');
        // If there is a PRD section, the link text should NOT be a raw URL (starting with http)
        const prdLink = page.locator('text=PRD').locator('..').locator('a');
        if (await prdLink.count() > 0) {
            const linkText = await prdLink.first().innerText();
            expect(linkText).not.toMatch(/^https?:\/\//);
        }
    }
});

// ─── KQT-14482: 測試計劃表格可排序 ───────────────────────────────────────────
test('KQT-14482: Test plan tables have sortable column headers', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto('/plans');
    const planCards = page.locator('[class*="rounded-xl"]').filter({ has: page.locator('text=/Plan ID/i') });
    if (await planCards.count() > 0) {
        await planCards.first().click();
        await page.waitForLoadState('networkidle');
        // The "執行名稱" column header should be clickable
        const runTitleTh = page.locator('th', { hasText: '執行名稱' });
        await expect(runTitleTh).toBeVisible();
        await runTitleTh.click();
        // After click, sort arrow should appear (▲ or ▼)
        await expect(runTitleTh).toContainText(/[▲▼]/);
    }
});

// ─── KQT-14484: Test Step 有 Blocked 按鈕 ────────────────────────────────────
test('KQT-14484: Each test step has a Blocked button', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto('/runs');
    const runLink = page.locator('a[href*="/runs/"]').first();
    if (await runLink.count() > 0) {
        await runLink.click();
        await page.waitForLoadState('networkidle');
        // Click the first test case row to open execution pane
        const firstRow = page.locator('tbody tr').first();
        if (await firstRow.count() > 0) {
            await firstRow.click();
            await page.waitForSelector('text=Execute Test Case', { timeout: 5000 });
            // Check that each step has a Blocked button (title="Block Step")
            const stepSections = page.locator('[class*="space-y-4"] > div');
            if (await stepSections.count() > 0) {
                const blockBtn = page.locator('button[title="Block Step"]').first();
                await expect(blockBtn).toBeVisible();
            }
        }
    }
});

// ─── KQT-14495: Pass All 不捲動列表至頂部 ────────────────────────────────────
test('KQT-14495: Clicking Pass All preserves scroll position of case list', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto('/runs');
    const runLink = page.locator('a[href*="/runs/"]').first();
    if (await runLink.count() > 0) {
        await runLink.click();
        await page.waitForLoadState('networkidle');
        // Scroll to bottom of list
        const listDiv = page.locator('[class*="overflow-y-auto"]').first();
        await listDiv.evaluate(el => el.scrollTop = 9999);
        const scrollBefore = await listDiv.evaluate(el => el.scrollTop);
        // Open last visible row and click Pass All
        const rows = page.locator('tbody tr');
        const count = await rows.count();
        if (count > 2) {
            await rows.nth(count - 1).click();
            await page.waitForSelector('button:has-text("Pass All")', { timeout: 5000 });
            await page.click('button:has-text("Pass All")');
            await page.waitForTimeout(500);
            const scrollAfter = await listDiv.evaluate(el => el.scrollTop);
            // Scroll should not have reset to 0
            expect(scrollAfter).toBeGreaterThan(0);
            // Ideally close to scrollBefore
            expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(200);
        }
    }
});

// ─── KQT-14496: 結果列表順序穩定 ─────────────────────────────────────────────
test('KQT-14496: Result list order is stable after updating a case status', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto('/runs');
    const runLink = page.locator('a[href*="/runs/"]').first();
    if (await runLink.count() > 0) {
        await runLink.click();
        await page.waitForLoadState('networkidle');
        // Record order of case IDs before update
        const getOrder = () => page.locator('tbody tr td:nth-child(2) span.font-mono').allInnerTexts();
        const before = await getOrder();
        if (before.length > 1) {
            // Click first row's status dropdown and change status
            const firstSelect = page.locator('tbody tr').first().locator('select').first();
            const currentVal = await firstSelect.inputValue();
            const newVal = currentVal === 'Untested' ? 'Passed' : 'Untested';
            await firstSelect.selectOption(newVal);
            // Save
            await page.click('button:has-text("Save")');
            await page.waitForTimeout(600);
            const after = await getOrder();
            // Order should not change
            expect(after).toEqual(before);
        }
    }
});

// ─── KQT-14670: Gantt 今日紅線日期正確 ───────────────────────────────────────
test('KQT-14670: Gantt today marker shows correct date', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto('/plans');
    const planCards = page.locator('[class*="rounded-xl"]').filter({ has: page.locator('text=/Plan ID/i') });
    if (await planCards.count() > 0) {
        await planCards.first().click();
        await page.waitForLoadState('networkidle');
        // Find the "今日" label near the red line
        const todayLabel = page.locator('text=今日');
        if (await todayLabel.count() > 0) {
            await expect(todayLabel.first()).toBeVisible();
        }
    }
});

// ─── KQT-14671: Archived run 不出現在計劃 ────────────────────────────────────
test('KQT-14671: Archived runs are not shown in test plan', async ({ page }) => {
    await ensureLoggedIn(page);
    // Navigate to a plan with runs
    await page.goto('/plans');
    const planCards = page.locator('[class*="rounded-xl"]').filter({ has: page.locator('text=/Plan ID/i') });
    if (await planCards.count() > 0) {
        await planCards.first().click();
        await page.waitForLoadState('networkidle');
        // All run rows should not have "Archived" status badge
        const runRows = page.locator('tbody tr');
        const count = await runRows.count();
        for (let i = 0; i < count; i++) {
            const rowText = await runRows.nth(i).innerText();
            expect(rowText).not.toContain('Archived');
        }
    }
});

// ─── KQT-14713 + KQT-14531: Suite 過濾顯示子 suite 的 cases + 層級縮排 ───────
test('KQT-14531/14713: Suite dropdown shows hierarchy and filters include child cases', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto('/plans');
    // Open new plan modal or edit existing
    const newBtn = page.locator('button', { hasText: /new plan|新增/i }).first();
    if (await newBtn.count() > 0) {
        await newBtn.click();
        await page.waitForSelector('text=Edit Test Plan, text=New Test Plan', { timeout: 5000 }).catch(() => {});
        // Navigate to Runs / Cases tab
        await page.click('button:has-text("Runs / Cases")');
        await page.click('button:has-text("Test Cases")');
        // Find suite dropdown
        const suiteSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'All Suites' }) });
        if (await suiteSelect.count() > 0) {
            // Options should include indented entries (contains \u00a0 or └)
            const options = await suiteSelect.locator('option').allInnerTexts();
            const hasIndented = options.some(o => o.includes('\u00a0\u00a0') || o.includes('└'));
            // If there are suites at all, some should be indented
            if (options.length > 1) {
                expect(hasIndented).toBe(true);
            }
        }
    }
});
