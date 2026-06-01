import { test, expect, type Page } from '@playwright/test';
import { ensureLoggedIn } from './utils';

/**
 * KQT-15399 — Test-Run row 「複製連結」icon clicks silently because
 * `navigator.clipboard.writeText` is undefined on the SIT deploy (plain
 * HTTP → not a secure context). The fix in `frontend/src/lib/clipboard.ts`
 * falls back to `document.execCommand('copy')` against a hidden textarea.
 *
 * This spec simulates the HTTP scenario on localhost (which IS a secure
 * context) by stripping the modern API at runtime: deleting `navigator.
 * clipboard` and forcing `window.isSecureContext = false`. Without the
 * fallback the icon stays as the Link2 (the old bug); with it, the icon
 * flips to the green Check.
 */

async function stripModernClipboard(page: Page) {
    await page.addInitScript(() => {
        // Force the helper down the execCommand path. The fix's gate is
        // `navigator.clipboard && window.isSecureContext`, so we need to
        // poke both.
        try {
            Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
        } catch { /* ignore — best-effort override */ }
        try {
            Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
        } catch { /* ignore */ }
    });
}

async function pickAnyRun(page: Page): Promise<number | null> {
    const res = await page.request.get('/api/v1/runs/project/1');
    if (res.status() !== 200) return null;
    const runs: { id: number }[] = await res.json();
    return runs.length > 0 ? runs[0].id : null;
}

test('KQT-15399: 「複製連結」icon falls back to execCommand under HTTP-like context', async ({ page }) => {
    await stripModernClipboard(page);
    await ensureLoggedIn(page);
    const runId = await pickAnyRun(page);
    test.skip(!runId, 'no runs in target env');

    await page.goto('/runs');
    await page.waitForLoadState('networkidle');

    // Find the run row, then hover its action group so the opacity-0 wrapper
    // around the icon buttons becomes interactive. Hover is implicit via .click.
    const runRow = page.locator(`text=/^Run-?#?${runId}$|TC-/`).first();
    // Use the icon button by its title attribute — robust against tab/icon swaps.
    const copyBtn = page.locator('button[title="複製連結"]').first();
    await expect(copyBtn).toBeAttached();
    // Force the click — the button sits inside a group-hover wrapper with
    // opacity-0 by default; .click({ force: true }) bypasses the visibility
    // check that group-hover would otherwise satisfy.
    await copyBtn.click({ force: true });

    // The fix: copyToClipboard returned true via execCommand, so setCopied(true)
    // ran and the icon swapped to the Check (text-emerald-500 styling, but the
    // markup just changes the svg). Assert by colour class for stability.
    const check = page.locator('button[title="複製連結"] svg.text-emerald-500').first();
    await expect(check).toBeVisible({ timeout: 2000 });
    // Before the fix the icon stayed on Link2 (no emerald) — that's how this
    // spec would have flagged the regression.
});

// Note: a "modern clipboard available" sanity test isn't worth carrying —
// Playwright's headless Chromium doesn't grant the clipboard-write permission
// by default, so the Async Clipboard API throws even on localhost (which IS
// a secure context). The fallback path covered by the test above is the
// regression that matters for KQT-15399; the modern path is covered by the
// browser's own conformance tests.
