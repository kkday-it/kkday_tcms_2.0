import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
// Load .env.test.local (gitignored) for local test credentials
try {
    fs.readFileSync('.env.test.local', 'utf-8').split('\n').forEach(line => {
        const idx = line.indexOf('=');
        if (idx > 0) process.env[line.slice(0, idx).trim()] ??= line.slice(idx + 1).trim();
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
