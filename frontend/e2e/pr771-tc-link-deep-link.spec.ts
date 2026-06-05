import { test, expect } from '@playwright/test';
import { ensureLoggedIn } from './utils';

// ─── PR #771 (KQT-15330) regression: TC-{id} link in a run row opens the ─────
//     Repository preview pane via `?case=<id>` deep link.
// Before #771 the case id column was plain text; users had to navigate to the
// repository manually and search by id. The deep-link wires the run row to a
// preview drawer in one click. This test pins that contract so a later refactor
// of Repository's searchParams handling doesn't silently break it.

test('PR #771: TC-{id} link from a run row opens Repository preview', async ({ page }) => {
    await ensureLoggedIn(page);

    // Find any run that has at least one result with a case_id we can deep-link to.
    type Run = { id: number; project_id: number };
    type Result = { case_id: number };
    const runsRes = await page.request.get('/api/v1/runs/project/1');
    expect(runsRes.status()).toBe(200);
    const runs: Run[] = await runsRes.json();
    test.skip(runs.length === 0, 'No runs on project 1 — TC-link path not reachable in this env');

    let targetRunId: number | null = null;
    let targetCaseId: number | null = null;
    for (const r of runs.slice(0, 10)) {
        const rr = await page.request.get(`/api/v1/results/run/${r.id}`);
        if (rr.status() !== 200) continue;
        const results: Result[] = await rr.json();
        const first = results.find(x => Number.isFinite(x.case_id) && x.case_id > 0);
        if (first) { targetRunId = r.id; targetCaseId = first.case_id; break; }
    }
    test.skip(!targetRunId || !targetCaseId, 'No run with results found — cannot exercise TC-link');

    // 1. Open the run detail page and click the TC-{id} link in the first row.
    //    The link is `target="_blank"`, so capture the new tab via `popup`.
    await page.goto(`/runs/${targetRunId}`);
    await page.waitForLoadState('networkidle');

    const tcLink = page.getByRole('link', { name: `TC-${targetCaseId}` }).first();
    await expect(tcLink).toBeVisible();

    const [popup] = await Promise.all([
        page.waitForEvent('popup'),
        tcLink.click(),
    ]);

    // 2. The popup should land on /repository?case=<id> and open the preview drawer.
    await popup.waitForLoadState('domcontentloaded');
    expect(popup.url()).toContain(`/repository?case=${targetCaseId}`);

    // The preview pane renders an inline TC label — assert it appears so we know
    // the ?case= effect actually fired (not just that the URL is right).
    await expect(popup.getByText(`TC-${targetCaseId}`).first()).toBeVisible({ timeout: 10_000 });
});
