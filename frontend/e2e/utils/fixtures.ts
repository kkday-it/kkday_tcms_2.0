/**
 * Canonical e2e fixtures — shared IDs / data that every spec should reuse
 * instead of picking "the first run from the API" or hardcoding their own.
 *
 * Why a single test run? Earlier specs each did `pickFirstRun()` /
 * `pickRunWithMixedPriorities()`, which made them flaky in two ways:
 *
 *   1. Run ordering changes when someone creates / archives a run on SIT,
 *      so the "first" run drifts and tests start clicking the wrong thing
 *   2. Some runs are intentionally empty / archived / WIP and shouldn't be
 *      driven by automation; picking blindly hits these and false-fails
 *
 * Pinning to one well-known run gives every spec the same predictable
 * dataset. Treat it as a fixture — do NOT manually delete or archive cases
 * in this run.
 *
 * If this run ever needs to be replaced (e.g. accidentally deleted),
 * update TEST_RUN_ID below and the constant flows everywhere.
 */

/**
 * Canonical TCMS test run for e2e automation.
 *
 * URL: http://autotest-service.sit.kkday.com:8081/tcms/runs/239
 *
 * Owner: e2e suite (do not edit manually). Contains a mix of priorities,
 * statuses, and assignees so filter / sort / row-click tests all have
 * non-empty assertions to make.
 */
export const TEST_RUN_ID = 239;
