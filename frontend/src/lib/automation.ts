// Shared automation-coverage helpers. Kept as pure functions so both the run
// detail page (computes % from the loaded case results) and the run list page
// (uses the backend-aggregated count) share one rounding rule, and so the logic
// is unit-testable without a running app.

/** TestCase.automation_status value for an automated case (mirrors backend statuses.AUTOMATED). */
export const AUTOMATED = 'Automated';

/** Percentage of `n` out of `total`, rounded to a whole number; 0 when `total` is 0. */
export function pct(n: number, total: number): number {
    return total > 0 ? Math.round((n / total) * 100) : 0;
}

/** Number of results whose case is marked Automated. */
export function countAutomated(
    results: ReadonlyArray<{ test_case?: { automation_status?: string } }>,
): number {
    return results.filter(r => r.test_case?.automation_status === AUTOMATED).length;
}
