import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { createHash } from 'node:crypto';
import { getTestCredentials } from './utils/secrets';

// PR-3 (#802) negative-path checks: non-Admin/QA tokens must hit 403 on every
// write/delete endpoint we locked down, and unauthenticated requests must hit
// 401. Uses page.request directly (no UI) — these are pure RBAC contract tests.

const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');

// One-time bootstrap helper for the whole suite: ensure a Tester user exists
// (via Admin) and return both tokens. Falls back to env overrides when present.
async function bootstrap(request: APIRequestContext) {
    const { email: adminEmail, password: adminPassword } = await getTestCredentials();
    const testerEmail = process.env.TESTER_EMAIL ?? 'pr802_negative_tester@kkday.com';
    // Default password for any newly-created user is "1234" per the backend's
    // create_user fallback (see app/api/users.py).
    const testerDefault = '1234';

    const adminLogin = await request.post('/api/v1/users/login', {
        data: { email: adminEmail, password: sha256Hex(adminPassword) },
    });
    if (adminLogin.status() !== 200) return null;
    const adminTok = (await adminLogin.json()).access_token as string;

    // Create the tester (idempotent: ignore 400 when the user already exists).
    await request.post('/api/v1/users/', {
        headers: { Authorization: `Bearer ${adminTok}` },
        data: { username: 'pr802_negative_tester', email: testerEmail, role: 'Tester' },
    });

    const testerLogin = await request.post('/api/v1/users/login', {
        data: { email: testerEmail, password: sha256Hex(testerDefault) },
    });
    if (testerLogin.status() !== 200) return null;  // password may have been rotated by a prior run
    const testerTok = (await testerLogin.json()).access_token as string;
    return { adminTok, testerTok };
}

function assert403(r: APIResponse, label: string) {
    expect(r.status(), `${label} expected 403 forbidden`).toBe(403);
}

function assert401(r: APIResponse, label: string) {
    expect(r.status(), `${label} expected 401 unauthorized`).toBe(401);
}

test.describe('PR-802 RBAC negative paths', () => {
    test('Tester role gets 403 on every locked write/delete endpoint', async ({ request }) => {
        const tokens = await bootstrap(request);
        test.skip(!tokens, 'cannot bootstrap admin/tester accounts in this env');
        const auth = { Authorization: `Bearer ${tokens!.testerTok}` };
        const json = { Authorization: `Bearer ${tokens!.testerTok}`, 'Content-Type': 'application/json' };

        // Deletes (most destructive — explicit 403 checks below).
        assert403(await request.delete('/api/v1/run-folders/999', { headers: auth }), 'DELETE /run-folders');
        assert403(await request.delete('/api/v1/cases/999', { headers: auth }), 'DELETE /cases');
        assert403(await request.delete('/api/v1/runs/999', { headers: auth }), 'DELETE /runs');
        assert403(await request.delete('/api/v1/plans/999', { headers: auth }), 'DELETE /plans');
        assert403(await request.delete('/api/v1/suites/999', { headers: auth }), 'DELETE /suites');

        // Creates.
        assert403(await request.post('/api/v1/run-folders/', {
            headers: json, data: { project_id: 1, name: 'tester-cannot' },
        }), 'POST /run-folders');

        // Admin-only endpoint: Tester must also be forbidden here (independent of Admin/QA path).
        assert403(await request.post('/api/v1/users/', {
            headers: json, data: { username: 'cannot', email: 'cannot@x', role: 'QA' },
        }), 'POST /users');
    });

    test('Tester can still hit GET endpoints (reads stay open in PR-3)', async ({ request }) => {
        const tokens = await bootstrap(request);
        test.skip(!tokens, 'cannot bootstrap admin/tester accounts in this env');
        const auth = { Authorization: `Bearer ${tokens!.testerTok}` };

        const r1 = await request.get('/api/v1/users/', { headers: auth });
        expect(r1.status()).toBe(200);
    });

    test('Unauthenticated DELETE hits 401 with the dict-shape detail body', async ({ request }) => {
        const r = await request.delete('/api/v1/run-folders/999');
        assert401(r, 'no-auth DELETE');
        const body = await r.json();
        // Backend deps.py shapes the detail as a dict (error/message/token_page/...)
        expect(typeof body.detail, 'detail must be a dict').toBe('object');
        expect(body.detail.error).toMatch(/^tcms_token_/);
        expect(body.detail.token_page).toBeTruthy();
    });

    test('change-password ownership: Tester cannot change Admin password (code review fix)', async ({ request }) => {
        const tokens = await bootstrap(request);
        test.skip(!tokens, 'cannot bootstrap admin/tester accounts in this env');

        // Look up the Admin's user_id via /users/ as Tester (read still allowed).
        const usersRes = await request.get('/api/v1/users/', {
            headers: { Authorization: `Bearer ${tokens!.testerTok}` },
        });
        const users: { id: number; email: string; role: string }[] = await usersRes.json();
        const adminUser = users.find(u => u.role === 'Admin');
        test.skip(!adminUser, 'no Admin user visible to Tester');

        const r = await request.post('/api/v1/users/change-password', {
            headers: { Authorization: `Bearer ${tokens!.testerTok}`, 'Content-Type': 'application/json' },
            data: { user_id: adminUser!.id, new_password: sha256Hex('whatever') },
        });
        expect(r.status(), 'Tester editing Admin password must be 403').toBe(403);
    });
});
