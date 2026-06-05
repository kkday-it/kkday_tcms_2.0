/**
 * Test credentials helper — pulls the TCMS e2e login from the autotest
 * secret service so we don't ship plaintext creds in this repo.
 *
 * Key location: `production / TCMS / TCMS_email`, value is JSON:
 *   { "TEST_EMAIL": "...", "TEST_PASSWORD": "..." }
 *
 * The plain (non-hashed) password is what we type into the login form —
 * Login.tsx pre-hashes with SHA-256 before POST, so the value stored in
 * the secret is the original password the user would type.
 *
 * Resolution order:
 *   1. `process.env.TEST_EMAIL` + `process.env.TEST_PASSWORD` (explicit
 *      override, useful for CI matrix / debugging without touching the
 *      secret service)
 *   2. Secret service via `SECRET_SERVICE_URL` (or `SERVICE_URL`) +
 *      `AUTOMATION_TOKEN`
 *   3. Otherwise: clear `Error` explaining how to set one of the above
 *
 * Cached in-process so a single Playwright run only hits the secret
 * service once even with N tests.
 */

export interface TestCredentials {
    email: string;
    password: string;
}

let cached: TestCredentials | null = null;

export async function getTestCredentials(): Promise<TestCredentials> {
    if (cached) return cached;

    // Explicit env override wins. Useful in CI where the runner already
    // injects them as masked secrets, or for one-off local debugging.
    const envEmail = process.env.TEST_EMAIL;
    const envPassword = process.env.TEST_PASSWORD;
    if (envEmail && envPassword) {
        cached = { email: envEmail, password: envPassword };
        return cached;
    }

    const base = process.env.SECRET_SERVICE_URL || process.env.SERVICE_URL;
    const token = process.env.AUTOMATION_TOKEN;
    if (!base || !token) {
        throw new Error(
            'e2e test credentials unavailable.\n'
            + 'Set EITHER:\n'
            + '  - TEST_EMAIL + TEST_PASSWORD env vars (explicit override), OR\n'
            + '  - SECRET_SERVICE_URL + AUTOMATION_TOKEN env vars '
            + '(to fetch production/TCMS/TCMS_email from the secret service)\n'
            + 'See backend/.env.example for the canonical values.',
        );
    }

    // Mirrors the backend's get_secret(env="production", service="TCMS",
    // key="TCMS_email", return_value=True) call.
    const url = new URL('/api/v1/data/', `${base.replace(/\/$/, '')}:8000`);
    url.searchParams.set('env', 'production');
    url.searchParams.set('service', 'TCMS');
    url.searchParams.set('key', 'TCMS_email');

    const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
        throw new Error(
            `secret service HTTP ${resp.status} fetching production/TCMS/TCMS_email — `
            + 'check SECRET_SERVICE_URL / AUTOMATION_TOKEN are valid.',
        );
    }

    const data = (await resp.json()) as Array<{ value?: string | object }>;
    if (!Array.isArray(data) || data.length === 0) {
        throw new Error('secret service returned no rows for production/TCMS/TCMS_email');
    }

    const rawValue = data[0].value;
    let parsed: any;
    try {
        parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
    } catch (err) {
        throw new Error(`secret value is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!parsed || typeof parsed.TEST_EMAIL !== 'string' || typeof parsed.TEST_PASSWORD !== 'string') {
        throw new Error(
            'secret payload missing TEST_EMAIL / TEST_PASSWORD. '
            + 'Expected JSON shape: {"TEST_EMAIL": "...", "TEST_PASSWORD": "..."}',
        );
    }

    cached = { email: parsed.TEST_EMAIL, password: parsed.TEST_PASSWORD };
    return cached;
}
