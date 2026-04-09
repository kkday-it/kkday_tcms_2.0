import { expect } from '@playwright/test';
import type { Locator } from '@playwright/test';

/**
 * Select an option in a React-controlled <select> and wait for the surrounding
 * form to acknowledge the change (e.g. a Save button becomes enabled).
 *
 * Strategy (tried in order):
 *  1. Playwright's built-in selectOption() — fires native 'change' event; works
 *     for React 16/17/18 when the root-delegated listener picks it up.
 *  2. Native value-setter + explicit 'input' + 'change' dispatch — covers cases
 *     where selectOption() fires the event but React batches/defers the update
 *     so the dirty signal doesn't become enabled within the timeout window.
 *
 * Each attempt is verified with expect(isDirtySignal).toBeEnabled() which
 * uses Playwright's built-in auto-retry/polling — unlike isEnabled() which
 * only checks the current state without waiting.
 *
 * ⚠️  Do NOT use React-internal keys (__reactProps, __reactFiber, etc.) here.
 *     Those are private APIs that break across minor React versions and violate
 *     black-box testing principles.
 *
 * Tested with: React 18 + Vite + Playwright 1.59
 */
export async function selectReactOption(
    locator: Locator,
    value: string,
    isDirtySignal: Locator,
    timeout = 3000,
): Promise<void> {
    // Attempt 1 — Playwright native
    await locator.selectOption(value);
    const attempt1Ok = await expect(isDirtySignal).toBeEnabled({ timeout }).then(() => true).catch(() => false);
    if (attempt1Ok) return;

    // Attempt 2 — native setter + input + change events
    // React 18 batches updates; dispatching 'input' before 'change' mirrors what
    // a real browser sends and ensures the synthetic event system processes both.
    await locator.evaluate((el: HTMLSelectElement, val: string) => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype, 'value'
        )?.set;
        nativeSetter?.call(el, val);
        el.dispatchEvent(new Event('input',  { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    }, value);
    const attempt2Ok = await expect(isDirtySignal).toBeEnabled({ timeout }).then(() => true).catch(() => false);
    if (attempt2Ok) return;

    throw new Error(
        `selectReactOption: selecting "${value}" did not enable the dirty signal within ${timeout}ms. ` +
        "Check that the select's onChange handler updates component state."
    );
}
