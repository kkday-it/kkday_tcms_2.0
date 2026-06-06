/**
 * Canonical run-status → badge classes.
 *
 * Shared by the runs list (TestRuns) and the run detail header (TestRunDetails)
 * so a given run shows the SAME colour on both pages. They had diverged: the
 * list greened "Active" (everything else slate), while the detail header greened
 * "Done" (everything else blue) — so an Active run looked green on the list but
 * blue on the detail page.
 *
 * Scheme: green = finished (Done), blue = in progress (Active/Testing),
 * amber = queued (Pending), slate = archived / unknown.
 */
const RUN_STATUS_BADGE: Record<string, string> = {
    Pending:  'bg-amber-50 text-amber-700 border-amber-200',
    Active:   'bg-primary-50 text-primary-700 border-primary-200',
    Testing:  'bg-primary-50 text-primary-700 border-primary-200',
    Done:     'bg-emerald-50 text-emerald-700 border-emerald-200',
    Archived: 'bg-slate-100 text-slate-600 border-slate-200',
};

const RUN_STATUS_FALLBACK = 'bg-slate-100 text-slate-600 border-slate-200';

/** Tailwind classes (bg + text + border) for a run-status badge. */
export function runStatusBadgeClasses(status?: string | null): string {
    return (status && RUN_STATUS_BADGE[status]) || RUN_STATUS_FALLBACK;
}
