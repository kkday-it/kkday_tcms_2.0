import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { ensureLoggedIn, canWrite } from './utils';
import { getTestCredentials } from './utils/secrets';
import { createHash } from 'node:crypto';

// Bug report (2026-05-28): clicking "編輯資料夾" on a folder blanked the page.
// Root cause: EditRunFolderModal / EditPlanFolderModal / EditSuiteModal called
// `useMemo` AFTER `if (!isOpen) return null` — opening the modal added a hook
// call between renders, hitting React's "Rendered more hooks than during the
// previous render" rule and crashing the component tree.
//
// This spec guards the fix: open the modal via the menu and verify (a) the
// modal heading is visible and (b) the page still has its core layout (i.e.
// did NOT blank out into an empty body).

const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');

async function adminToken(request: APIRequestContext): Promise<string | null> {
    const { email, password } = await getTestCredentials();
    const res = await request.post('/api/v1/users/login', {
        data: { email, password: sha256Hex(password) },
    });
    if (res.status() !== 200) return null;
    return (await res.json()).access_token as string;
}

/** Ensure at least one run-folder exists, returning its visible name. */
async function ensureRunFolder(request: APIRequestContext, token: string): Promise<string | null> {
    const list = await request.get('/api/v1/run-folders/project/1', {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (list.status() !== 200) return null;
    const folders: { name: string }[] = await list.json();
    if (folders.length > 0) return folders[0].name;
    const created = await request.post('/api/v1/run-folders/', {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { project_id: 1, name: 'e2e regression folder' },
    });
    if (created.status() !== 200) return null;
    return (await created.json()).name;
}

/** Open the "更多操作" menu on the first run-folder and click "編輯資料夾". */
async function openEditFolderModal(page: Page, folderName: string) {
    await page.evaluate((name) => {
        const span = [...document.querySelectorAll('span')].find(el => el.textContent === name);
        if (!span) throw new Error(`folder span "${name}" not found`);
        let container: Element | null = span;
        for (let i = 0; i < 8 && container; i++) {
            container = container.parentElement;
            if (!container) break;
            const more = container.querySelector('button[title="更多操作"]') as HTMLButtonElement | null;
            if (more) {
                // The menu sits inside a group-hover wrapper that's opacity-0 until
                // hovered; force opacity-100 so click() lands and the menu renders.
                const wrap = more.closest('[class*="opacity-0"]') as HTMLElement | null;
                if (wrap) wrap.style.opacity = '1';
                more.click();
                return;
            }
        }
        throw new Error('no "更多操作" button found near folder');
    }, folderName);

    await page.waitForFunction(() => {
        return [...document.querySelectorAll('button')].some(b => b.textContent?.trim() === '編輯資料夾');
    }, { timeout: 3000 });

    await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === '編輯資料夾') as HTMLButtonElement;
        btn.click();
    });
}

test('編輯資料夾 modal opens without blanking the page (regression guard for the useMemo-after-return bug)', async ({ page, request }) => {
    const { role } = await ensureLoggedIn(page);
    // PR-3 RBAC hides the 編輯資料夾 dropdown item for non-Admin/QA via the
    // canWrite gate in SuiteNode / PlanFolderNode / RunFolderNode. This spec
    // tests the useMemo-after-return regression, which only matters when the
    // write button is reachable — skip cleanly under read-only accounts.
    test.skip(!canWrite(role), '編輯資料夾 button is gated to Admin/QA');
    const token = await adminToken(request);
    test.skip(!token, 'cannot obtain admin token');

    const folderName = await ensureRunFolder(request, token!);
    test.skip(!folderName, 'cannot list or create a run folder for the test');

    // Capture errors as the modal opens — the pre-fix bug throws "Rendered more
    // hooks than during the previous render" right here.
    const pageErrors: Error[] = [];
    page.on('pageerror', (e) => pageErrors.push(e));

    await page.goto('/runs');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector(`text=${folderName}`, { timeout: 5000 });

    await openEditFolderModal(page, folderName!);

    // Modal heading must be present — h2 inside the EditRunFolderModal renders "Edit Folder".
    await expect(page.locator('h2', { hasText: /Edit Folder|資料夾/ }).first()).toBeVisible({ timeout: 3000 });

    // Page is NOT blank: nav links from MainLayout should still be there.
    const navLinks = page.locator('nav a, nav button');
    await expect(navLinks.first()).toBeVisible();

    // No React "Rendered more hooks" exception during the modal open.
    const hookErrors = pageErrors.filter(e => /Rendered more hooks|Rules of Hooks/i.test(e.message));
    expect(hookErrors, `expected no hook-order errors, got: ${hookErrors.map(e => e.message).join('\n')}`).toHaveLength(0);
});
