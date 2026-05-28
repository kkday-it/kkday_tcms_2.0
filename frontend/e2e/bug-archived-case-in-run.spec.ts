import { test, expect, type APIRequestContext } from '@playwright/test';
import { ensureLoggedIn } from './utils';
import { createHash } from 'node:crypto';

// Bug report (2026-05-28): archived TestCases still appear in their parent
// TestRun's result list and the user can't remove them via the edit modal
// (which lists active cases only). Fix: filter `TestCase.status != 'Archived'`
// on the read endpoint. This spec proves the fix end-to-end:
//
//   pick run → grab first case_id → DELETE /cases/{id} (archive) →
//   assert case_id absent from GET /results/run/{id} → POST /cases/{id}/restore
//   → assert it reappears.
//
// The roundtrip restores DB state so the test is safe to re-run against any
// env. Will skip cleanly when no suitable run/case is available.

const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');

async function loginAdmin(request: APIRequestContext): Promise<string | null> {
    const email = process.env.TEST_EMAIL ?? 'CI_test@kkday.com';
    const password = process.env.TEST_PASSWORD ?? 'KKday1234567890!';
    const res = await request.post('/api/v1/users/login', {
        data: { email, password: sha256Hex(password) },
    });
    if (res.status() !== 200) return null;
    return (await res.json()).access_token as string;
}

test('archived TestCase is hidden from its TestRun result list', async ({ page, request }) => {
    await ensureLoggedIn(page);
    const token = await loginAdmin(request);
    test.skip(!token, 'cannot obtain admin token');
    const auth = { Authorization: `Bearer ${token!}` };

    // Find a run that has at least one result.
    const runsRes = await request.get('/api/v1/runs/project/1', { headers: auth });
    test.skip(runsRes.status() !== 200, 'runs API unavailable');
    const runs: { id: number; total?: number }[] = await runsRes.json();
    const run = runs.find(r => (r.total ?? 0) >= 1);
    test.skip(!run, 'no run with results in target env');

    const resultsBefore = await request.get(`/api/v1/results/run/${run!.id}`, { headers: auth });
    test.skip(resultsBefore.status() !== 200, 'results endpoint unavailable');
    const before: { case_id: number; test_case?: { title?: string } }[] = await resultsBefore.json();
    test.skip(before.length === 0, 'run reports total>=1 but result list is empty');
    const victim = before[0];
    const victimId = victim.case_id;

    // Sanity: case is present before archiving.
    expect(before.some(r => r.case_id === victimId)).toBe(true);

    // Archive the case (soft-delete — sets case.status='Archived').
    const archiveRes = await request.delete(`/api/v1/cases/${victimId}`, { headers: auth });
    test.skip(archiveRes.status() !== 200, 'archive call failed (likely role/auth)');

    try {
        // The actual assertion: the archived case must no longer appear in run results.
        const resultsAfter = await request.get(`/api/v1/results/run/${run!.id}`, { headers: auth });
        expect(resultsAfter.status()).toBe(200);
        const after: { case_id: number }[] = await resultsAfter.json();
        expect(
            after.some(r => r.case_id === victimId),
            `archived case ${victimId} must NOT appear in run ${run!.id} result list`,
        ).toBe(false);
        // Total count drops by exactly the rows we hid (one row per run-victim pair).
        const hiddenCount = before.filter(r => r.case_id === victimId).length;
        expect(after.length).toBe(before.length - hiddenCount);
    } finally {
        // Always restore so the test is safe to re-run.
        await request.post(`/api/v1/cases/${victimId}/restore`, { headers: auth });
    }

    // Post-restore: the case reappears in the run.
    const resultsRestored = await request.get(`/api/v1/results/run/${run!.id}`, { headers: auth });
    const restored: { case_id: number }[] = await resultsRestored.json();
    expect(restored.some(r => r.case_id === victimId)).toBe(true);
});
