import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
// Load .env.test.local (gitignored) for local test credentials
try {
    fs.readFileSync('.env.test.local', 'utf-8').split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const idx = trimmed.indexOf('=');
        if (idx <= 0) return;
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).split('#')[0].trim(); // strip inline comments
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1); // strip surrounding quotes
        }
        process.env[key] ??= val;
    });
} catch { /* file absent in CI — env vars must be set externally */ }

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    retries: 0,
    workers: 1,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:8085',
        headless: true,
        screenshot: 'only-on-failure',
        video: 'off',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
