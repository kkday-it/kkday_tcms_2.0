import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { Loader2, ArrowLeft, CheckCircle2, XCircle, SkipForward, Circle, Edit2, Search, X, Save, Ban, Copy, Check } from 'lucide-react';
import api from '../lib/api';
import { caseLabel } from '../lib/caseLabel';
import { canWrite } from '../lib/permissions';
import { runStatusBadgeClasses } from '../lib/runStatus';
import { useUsers } from '../lib/useUsers';
import TestCaseExecutionPane from '../components/runs/TestCaseExecutionPane';
import EditRunModal from '../components/runs/EditRunModal';
import PillGroup, { type PillOption } from '../components/common/PillGroup';
import SortableHeader, { type SortDirection } from '../components/common/SortableHeader';
import { useUrlString, useUrlStringList, useUrlSortState } from '../lib/useUrlState';

interface TestResult {
    id: number;
    run_id: number;
    case_id: number;
    status: string;
    duration_ms?: number;
    comment?: string;
    executed_at?: string;
    assignee_id?: number;
    test_case?: {
        title: string;
        external_id?: string;
        priority: string;
        labels?: string;
        tags?: string;
        folder_id?: number;
    };
}

// Result enum matches backend tcms_test_results.status (Untested/Passed/Failed/
// Blocked/Skipped). Order is the spec v3 §4.3 + §5.1 canonical display rank.
const STATUS_OPTIONS = ['Passed', 'Failed', 'Untested', 'Blocked', 'Skipped'];

// Spec v3 §4.3 Result pill mapping — value matches backend enum, label is the
// user-facing copy (e.g. "Skipped" → "Skip" reads tighter in a pill).
const RESULT_PILL_OPTIONS: ReadonlyArray<PillOption> = [
    { value: 'Passed',   label: 'Passed',   variant: 'success' },
    { value: 'Failed',   label: 'Failed',   variant: 'danger' },
    { value: 'Untested', label: 'Untested', variant: 'info' },
    { value: 'Blocked',  label: 'Blocked',  variant: 'warning' },
    { value: 'Skipped',  label: 'Skip',     variant: 'neutral' },
];

// Spec v3 §4.3 Priority pill mapping — Not Set takes a dashed border (style)
// to flag it as a transitional bucket; remove the dashed branch once Priority
// becomes mandatory (spec v3 §4.3 footnote).
const PRIORITY_PILL_OPTIONS: ReadonlyArray<PillOption> = [
    { value: 'Critical', label: 'Critical', variant: 'danger' },
    { value: 'High',     label: 'High',     variant: 'warning' },
    { value: 'Medium',   label: 'Medium',   variant: 'info' },
    { value: 'Low',      label: 'Low',      variant: 'success' },
    { value: 'Not Set',  label: 'Not Set',  variant: 'neutral', style: 'dashed' },
];

// Display prefix for test run IDs in the UI, e.g. run 230 → "KQT-R230"
const RUN_ID_PREFIX = 'KQT-R';

// Batch "Assign to" dropdown sentinels. Named so the Keep/Unassign protocol
// values aren't repeated as bare magic strings across the handler and the
// <select> options. (PR #822 review)
const ASSIGNEE_KEEP = '';                  // "— Keep —": leave assignee_id untouched
const ASSIGNEE_UNASSIGN = '__unassign__';  // explicit Unassign: set assignee_id to null


const STATUS_SELECT_STYLES: Record<string, string> = {
    Passed: 'border-green-300 bg-green-50 text-green-700',
    Failed: 'border-red-300 bg-red-50 text-red-700',
    Blocked: 'border-amber-300 bg-amber-50 text-amber-700',
    // KQT-15524: Skipped gets its own (filled slate) chip so it reads as a
    // deliberate outcome, distinct from the near-white Untested default.
    Skipped: 'border-slate-300 bg-slate-100 text-slate-700',
    Untested: 'border-slate-200 bg-white text-slate-600',
};

function parseJsonList(raw?: string): string[] {
    if (!raw) return [];
    if (raw.startsWith('[')) {
        try { return JSON.parse(raw); } catch { /* fall through */ }
    }
    return raw.split(',').map(s => s.trim()).filter(Boolean);
}

export default function TestRunDetails() {
    const { runId } = useParams();
    const [searchParams] = useSearchParams();
    const fromFolder = searchParams.get('from_folder');
    const [results, setResults] = useState<TestResult[]>([]);
    const [testRun, setTestRun] = useState<any | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedResultId, setSelectedResultId] = useState<number | null>(null);
    const [idCopied, setIdCopied] = useState(false);
    const resultListRef = useRef<HTMLDivElement>(null);

    // Local unsaved state maps: resultId → value
    const [unsavedStatuses, setUnsavedStatuses] = useState<Record<number, string>>({});
    const [unsavedAssignees, setUnsavedAssignees] = useState<Record<number, string>>({});
    const { users } = useUsers();

    // Batch selection
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
    const [batchAssigneeId, setBatchAssigneeId] = useState<string>(ASSIGNEE_KEEP);
    const [batchStatus, setBatchStatus] = useState<string>('');

    // Edit modal
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [folders, setFolders] = useState<{ id: number; name: string }[]>([]);

    // ── FILTERS ──────────────────────────────────────────────────────────────
    const [filterAssignToMe, setFilterAssignToMe] = useState(false);
    const [filterUnassigned, setFilterUnassigned] = useState(false);
    // Spec v3 §9: q / result / priority / sort survive reload + shared links.
    // The less-common dimensions (label / tag / assignee) stay in-memory
    // for now — refactoring the 3-bool assignee model adds risk without
    // matching reload value.
    const [filterSearch, setFilterSearch] = useUrlString('q');
    const [filterStatus, setFilterStatus] = useUrlStringList('result');
    const [filterPriority, setFilterPriority] = useUrlStringList('priority');
    const [filterLabel, setFilterLabel] = useState('');
    const [filterTag, setFilterTag] = useState('');
    // '' = any assignee. Stored as string so the <select> value type stays simple;
    // converted to number on compare. Unassigned is already covered by filterUnassigned.
    const [filterAssigneeId, setFilterAssigneeId] = useState<string>('');
    // Sort: header click cycles asc→desc→null. null means "fall back to the
    // canonical default" — case_id ascending, set by the filteredResults
    // comparator below. (Spec v3 §5.2 cycle: unsorted → asc → desc → default.)
    type SortKey = 'case' | 'priority' | 'result' | 'assignee';
    const [sortState, setSortState] = useUrlSortState('sort');
    const sortKey = sortState.key as SortKey | null;
    const sortDirection: SortDirection = sortState.direction;
    const handleSort = (key: string, dir: SortDirection) => {
        setSortState({ key: dir === null ? null : key, direction: dir });
    };

    // Current user id derived from login localStorage
    const currentUserId = useMemo(() => {
        try {
            const stored = localStorage.getItem('tcms_user');
            if (!stored) return null;
            const parsed = JSON.parse(stored);
            return parsed?.id ?? null;
        } catch {
            return null;
        }
    }, []);

    // Unique labels/tags across all results for filter dropdowns
    const allLabels = useMemo(() => {
        const set = new Set<string>();
        results.forEach(r => parseJsonList(r.test_case?.labels).forEach(l => set.add(l)));
        return [...set].sort();
    }, [results]);

    const allTags = useMemo(() => {
        const set = new Set<string>();
        results.forEach(r => parseJsonList(r.test_case?.tags).forEach(t => set.add(t)));
        return [...set].sort();
    }, [results]);

    // Canonical severity order (Critical→Not Set); ranks higher-severity smaller so
    // ascending rank == descending severity == "priority-desc" / High→Low display order.
    const PRIORITY_OPTIONS = ['Critical', 'High', 'Medium', 'Low', 'Not Set'] as const;
    const priorityRank = (p: string | undefined | null) => {
        const idx = PRIORITY_OPTIONS.indexOf((p || 'Not Set') as typeof PRIORITY_OPTIONS[number]);
        return idx < 0 ? PRIORITY_OPTIONS.length : idx;  // anything off-canonical sinks below Not Set
    };
    // Result canonical order (spec v3 §5.1): Passed → Failed → Untested →
    // Blocked → Skipped. Anything unknown sinks below — same pattern as
    // priorityRank.
    const resultRank = (r: string | undefined | null) => {
        const idx = STATUS_OPTIONS.indexOf((r || 'Untested') as string);
        return idx < 0 ? STATUS_OPTIONS.length : idx;
    };

    // Distinct priorities seen in this run — used to dim buttons for buckets that
    // wouldn't filter anything (avoids confusing the user with options that match 0 rows).
    const presentPriorities = useMemo(() => {
        const set = new Set<string>();
        results.forEach(r => set.add(r.test_case?.priority || 'Not Set'));
        return set;
    }, [results]);

    // Distinct assignees in this run (id + display name resolved via useUsers cache).
    // Build the user id→record map once per `users` change. As the org grows
    // (TCMS may reach ~300 users), a per-assignee `users.find()` becomes O(N·M);
    // the Map collapses it to O(N + M) and `users` updates are infrequent.
    const userById = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

    const allAssignees = useMemo(() => {
        const ids = new Set<number>();
        results.forEach(r => { if (r.assignee_id != null) ids.add(r.assignee_id); });
        return [...ids]
            .map(id => {
                const u = userById.get(id);
                return { id, name: u?.full_name || u?.username || u?.email || `User ${id}` };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [results, userById]);

    // ── FILTERED RESULTS ─────────────────────────────────────────────────────
    const filteredResults = useMemo(() => {
        const filtered = results.filter(r => {
            if (filterSearch) {
                const q = filterSearch.toLowerCase();
                const titleMatch = r.test_case?.title?.toLowerCase().includes(q);
                const idMatch = r.case_id.toString().includes(q);
                const extMatch = r.test_case?.external_id?.toLowerCase().includes(q);
                if (!titleMatch && !idMatch && !extMatch) return false;
            }
            if (filterAssignToMe && currentUserId !== null) {
                if (r.assignee_id !== currentUserId) return false;
            }
            if (filterUnassigned) {
                if (r.assignee_id != null) return false;
            }
            if (filterAssigneeId !== '') {
                if (r.assignee_id !== Number(filterAssigneeId)) return false;
            }
            if (filterStatus.length > 0) {
                if (!filterStatus.includes(r.status)) return false;
            }
            if (filterPriority.length > 0) {
                const p = r.test_case?.priority || 'Not Set';
                if (!filterPriority.includes(p)) return false;
            }
            if (filterLabel) {
                const labels = parseJsonList(r.test_case?.labels);
                if (!labels.some(l => l.toLowerCase().includes(filterLabel.toLowerCase()))) return false;
            }
            if (filterTag) {
                const tags = parseJsonList(r.test_case?.tags);
                if (!tags.some(t => t.toLowerCase().includes(filterTag.toLowerCase()))) return false;
            }
            return true;
        });
        // Default sort: case_id ascending (KQT-15251). Header-driven sort
        // applies its key first, with case_id as a stable tiebreaker so order
        // is reproducible within a bucket.
        return [...filtered].sort((a, b) => {
            if (sortKey === 'priority') {
                const r = priorityRank(a.test_case?.priority) - priorityRank(b.test_case?.priority);
                const cmp = sortDirection === 'desc' ? -r : r;
                if (cmp !== 0) return cmp;
            } else if (sortKey === 'result') {
                const r = resultRank(a.status) - resultRank(b.status);
                const cmp = sortDirection === 'desc' ? -r : r;
                if (cmp !== 0) return cmp;
            } else if (sortKey === 'assignee') {
                const an = userById.get(a.assignee_id ?? -1)?.full_name
                    ?? userById.get(a.assignee_id ?? -1)?.username ?? '￿';  // unassigned sinks
                const bn = userById.get(b.assignee_id ?? -1)?.full_name
                    ?? userById.get(b.assignee_id ?? -1)?.username ?? '￿';
                const r = an.localeCompare(bn);
                const cmp = sortDirection === 'desc' ? -r : r;
                if (cmp !== 0) return cmp;
            } else if (sortKey === 'case') {
                const r = a.case_id - b.case_id;
                const cmp = sortDirection === 'desc' ? -r : r;
                if (cmp !== 0) return cmp;
            }
            return a.case_id - b.case_id;
        });
    }, [results, filterSearch, filterAssignToMe, filterUnassigned, filterAssigneeId, filterStatus, filterPriority, filterLabel, filterTag, currentUserId, sortKey, sortDirection, userById]);

    const activeFilterCount = [
        filterAssignToMe, filterUnassigned, filterAssigneeId !== '',
        filterStatus.length > 0, filterPriority.length > 0,
        filterLabel !== '', filterTag !== '', filterSearch !== ''
    ].filter(Boolean).length;

    // ── Dirty check ──────────────────────────────────────────────────────────
    const hasPendingChanges = useMemo(() => {
        return results.some(r => {
            const statusChanged = unsavedStatuses[r.id] !== undefined && unsavedStatuses[r.id] !== r.status;
            const assigneeChanged = (unsavedAssignees[r.id] ?? '') !== (r.assignee_id ? String(r.assignee_id) : '');
            return statusChanged || assigneeChanged;
        });
    }, [results, unsavedStatuses, unsavedAssignees]);

    // ── DATA ─────────────────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            // Parallel: run, results (users from useUsers cache; folders needs project_id from run)
            const [runRes, resultsRes] = await Promise.all([
                api.get(`/runs/${runId}`),
                api.get(`/results/run/${runId}`),
            ]);
            setTestRun(runRes.data);
            setResults(resultsRes.data);

            const foldersRes = await api.get(`/run-folders/project/${runRes.data.project_id || 1}`);
            setFolders(foldersRes.data);

            // Initialise local unsaved maps from fetched data
            const initStatuses: Record<number, string> = {};
            const initAssignees: Record<number, string> = {};
            resultsRes.data.forEach((r: TestResult) => {
                initStatuses[r.id] = r.status;
                if (r.assignee_id) initAssignees[r.id] = String(r.assignee_id);
            });
            setUnsavedStatuses(initStatuses);
            setUnsavedAssignees(initAssignees);
        } catch (error) {
            console.error('Failed to fetch data', error);
        } finally {
            setIsLoading(false);
        }
    }, [runId]);

    useEffect(() => {
        if (runId) fetchData();
    }, [runId, fetchData]);

    // ── Handlers ─────────────────────────────────────────────────────────────

    /** Update unsaved status for a single row (no API call) */
    const handleStatusChange = (resultId: number, value: string) => {
        setUnsavedStatuses(prev => ({ ...prev, [resultId]: value }));
    };

    /** Update unsaved assignee for a single row (no API call) */
    const handleAssignChange = (resultId: number, value: string) => {
        setUnsavedAssignees(prev => ({ ...prev, [resultId]: value }));
    };

    /** Global Save – persist all pending changes */
    const handleSaveAll = async () => {
        setIsSaving(true);
        try {
            const dirtyRows = results.filter(r => {
                const statusChanged = unsavedStatuses[r.id] !== undefined && unsavedStatuses[r.id] !== r.status;
                const assigneeChanged = (unsavedAssignees[r.id] ?? '') !== (r.assignee_id ? String(r.assignee_id) : '');
                return statusChanged || assigneeChanged;
            });
            await Promise.all(dirtyRows.map(r =>
                api.put(`/results/${r.id}`, {
                    status: unsavedStatuses[r.id] ?? r.status,
                    assignee_id: unsavedAssignees[r.id] ? Number(unsavedAssignees[r.id]) : null,
                })
            ));
            await fetchData();
        } catch (error) {
            console.error('Failed to save changes', error);
        } finally {
            setIsSaving(false);
        }
    };


    const toggleRow = (id: number) => {
        setSelectedRows(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        setSelectedRows(selectedRows.size === filteredResults.length ? new Set() : new Set(filteredResults.map(r => r.id)));
    };

    /** Batch apply – status and/or assignee.
     *
     *  Assignee dropdown semantics (matches the three options the UI offers):
     *    - ''           → "Keep" — do not touch assignee_id on these rows
     *    - '__unassign__' → set assignee_id to null
     *    - '<userId>'   → set assignee_id to the numeric user id
     *
     *  Bug fixed (2026-06-02): the original guard `batchAssigneeId !==
     *  undefined` always passed (initial state is `''`, not undefined), so
     *  picking "Keep" was silently treated as Unassign — batch-changing
     *  status alone wiped every selected row's assignee. */
    const handleBatchApply = async () => {
        if (!batchStatus && !batchAssigneeId) return;
        try {
            await Promise.all([...selectedRows].map(resultId => {
                const payload: Record<string, any> = {};
                if (batchStatus) payload.status = batchStatus;
                if (batchAssigneeId === ASSIGNEE_UNASSIGN) {
                    payload.assignee_id = null;
                } else if (batchAssigneeId) {
                    payload.assignee_id = Number(batchAssigneeId);
                }
                // ASSIGNEE_KEEP ('') → leave assignee_id out of the payload entirely
                return api.put(`/results/${resultId}`, payload);
            }));
            setSelectedRows(new Set());
            setBatchAssigneeId(ASSIGNEE_KEEP);
            setBatchStatus('');
            fetchData();
        } catch (err) {
            console.error('Batch apply failed', err);
        }
    };

    /** Re-fetch while keeping the list scroll position (for onUpdated from pane) */
    const fetchDataPreservingScroll = useCallback(async () => {
        const scrollTop = resultListRef.current?.scrollTop ?? 0;
        await fetchData();
        requestAnimationFrame(() => {
            if (resultListRef.current) resultListRef.current.scrollTop = scrollTop;
        });
    }, [fetchData]);

    // Human-facing run identifier, e.g. "KQT-R230". Prefer the backend-assigned
    // external_id; fall back to deriving it from the id for runs created before
    // the external_id rollout / backfill.
    const runDisplayId = testRun?.external_id || `${RUN_ID_PREFIX}${testRun?.id ?? runId}`;

    const handleCopyRunId = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(runDisplayId);
        } catch {
            // Fallback for browsers/contexts where the async Clipboard API is unavailable
            const ta = document.createElement('textarea');
            ta.value = runDisplayId;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch { /* ignore */ }
            document.body.removeChild(ta);
        }
        setIdCopied(true);
        window.setTimeout(() => setIdCopied(false), 1500);
    }, [runDisplayId]);

    const handleCompleteRun = async () => {
        if (!window.confirm('Mark this run as Done?')) return;
        try {
            await api.put(`/runs/${runId}`, { status: 'Done' });
            fetchData();
        } catch (error) {
            console.error('Failed to complete run', error);
        }
    };

    const clearAllFilters = () => {
        setFilterAssignToMe(false);
        setFilterUnassigned(false);
        setFilterAssigneeId('');
        setFilterStatus([]);
        setFilterPriority([]);
        setFilterLabel('');
        setFilterTag('');
        setFilterSearch('');
        // Sort isn't really a "filter" — keep user's chosen sort across Clear.
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-50">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            </div>
        );
    }

    const writable = canWrite();
    const passed = results.filter(r => r.status === 'Passed').length;
    const failed = results.filter(r => r.status === 'Failed').length;
    const blocked = results.filter(r => r.status === 'Blocked').length;
    // KQT-15524: Skipped is an executed outcome — count it separately and keep
    // it OUT of untested, so a run where every case is Skipped still reads 100%.
    const skipped = results.filter(r => r.status === 'Skipped').length;
    const total = results.length;
    // Untested = anything not P/F/B/Skip (the genuinely not-yet-touched rows).
    const unt = total - (passed + failed + blocked + skipped);
    const passPct = total > 0 ? (passed / total) * 100 : 0;
    const failPct = total > 0 ? (failed / total) * 100 : 0;
    const blockedPct = total > 0 ? (blocked / total) * 100 : 0;
    const skipPct = total > 0 ? (skipped / total) * 100 : 0;
    // Progress = share of cases with any recorded outcome (incl. Skip).
    const progressPct = total > 0 ? Math.round(((passed + failed + blocked + skipped) / total) * 100) : 0;

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50 relative overflow-hidden">
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="px-8 py-6 border-b border-slate-200 bg-white shadow-sm z-10">
                <div className="flex items-start gap-4 mb-5">
                    <Link to={fromFolder ? `/runs?folder=${fromFolder}` : testRun?.folder_id ? `/runs?folder=${testRun.folder_id}` : '/runs'} className="mt-0.5 shrink-0 p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>

                    {/* Title block — "eyebrow" metadata row (id chip + run-type + status)
                        sits ABOVE the title, so the title owns a full-width line and can
                        wrap cleanly without colliding with the badges. */}
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <button
                                type="button"
                                onClick={handleCopyRunId}
                                title={idCopied ? 'Copied!' : `Click to copy ${runDisplayId}`}
                                className="group inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-mono font-semibold whitespace-nowrap border bg-primary-50 text-primary-700 border-primary-200 hover:bg-primary-100 hover:border-primary-300 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary-400"
                            >
                                {runDisplayId}
                                {idCopied
                                    ? <Check className="w-3 h-3 text-emerald-500" />
                                    : <Copy className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" />}
                            </button>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium border bg-primary-50 text-primary-700 border-primary-200">
                                {testRun?.run_type || 'Feature Test'}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${runStatusBadgeClasses(testRun?.status)}`}>
                                {testRun?.status || 'Pending'}
                            </span>
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900 leading-tight">{testRun?.title || 'Test Run Execution'}</h1>
                    </div>

                    <div className="shrink-0 self-center flex items-center gap-3">
                        {/* Global Save button */}
                        <button
                            onClick={handleSaveAll}
                            disabled={!hasPendingChanges || isSaving}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-all shadow-sm flex items-center gap-2
                                ${hasPendingChanges
                                    ? 'bg-primary-600 text-white border-primary-600 hover:bg-primary-700 cursor-pointer'
                                    : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                }`}
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save
                            {hasPendingChanges && (
                                <span className="ml-0.5 bg-white/20 rounded-full px-1.5 text-xs">
                                    {results.filter(r => {
                                        const sc = unsavedStatuses[r.id] !== undefined && unsavedStatuses[r.id] !== r.status;
                                        const ac = (unsavedAssignees[r.id] ?? '') !== (r.assignee_id ? String(r.assignee_id) : '');
                                        return sc || ac;
                                    }).length}
                                </span>
                            )}
                        </button>

                        {writable && (
                            <button
                                onClick={() => setIsEditModalOpen(true)}
                                className="px-4 py-2 bg-white text-slate-700 border border-slate-200 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors shadow-sm flex items-center gap-2"
                            >
                                <Edit2 className="w-4 h-4" /> Edit Run
                            </button>
                        )}
                        {writable && testRun?.status !== 'Done' && (
                            <button
                                onClick={handleCompleteRun}
                                className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
                            >
                                Complete Run
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-6 text-sm text-slate-600">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{total}</span> Cases
                        </div>
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" /> <span className="font-semibold text-green-600">{passed}</span> Passed
                        </div>
                        <div className="flex items-center gap-2">
                            <XCircle className="w-4 h-4 text-red-500" /> <span className="font-semibold text-red-600">{failed}</span> Failed
                        </div>
                        <div className="flex items-center gap-2">
                            <Ban className="w-4 h-4 text-amber-500" /> <span className="font-semibold text-amber-600">{blocked}</span> Blocked
                        </div>
                        <div className="flex items-center gap-2">
                            <SkipForward className="w-4 h-4 text-slate-500" /> <span className="font-semibold text-slate-600">{skipped}</span> Skipped
                        </div>
                        <div className="flex items-center gap-2">
                            <Circle className="w-4 h-4 text-slate-400" /> <span className="font-semibold text-slate-500">{unt}</span> Untested
                        </div>
                    </div>

                    <div className="w-full md:w-96">
                        <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1.5">
                            <span>Progress</span>
                            <span>{progressPct}% Completed</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex shadow-inner border border-slate-200/30">
                            <div style={{ width: `${passPct}%` }} className="bg-emerald-500 h-full transition-all duration-500 ease-out"></div>
                            <div style={{ width: `${failPct}%` }} className="bg-rose-500 h-full transition-all duration-500 ease-out border-l border-white/10"></div>
                            <div style={{ width: `${blockedPct}%` }} className="bg-amber-400 h-full transition-all duration-500 ease-out border-l border-white/10"></div>
                            <div style={{ width: `${skipPct}%` }} className="bg-slate-400 h-full transition-all duration-500 ease-out border-l border-white/10"></div>
                            <div style={{ width: `${(100 - passPct - failPct - blockedPct - skipPct)}%` }} className="bg-slate-200 h-full transition-all duration-500 ease-out border-l border-white/10"></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── List ────────────────────────────────────────────────────────── */}
            <div ref={resultListRef} className="flex-1 overflow-y-auto w-full p-8">
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

                    {/* ── Filter (spec v3 §4: two-row, no More) ──────────────────
                        Row 1: search + 3 dropdowns (assignee/labels/tags)
                        Row 2: Result + Priority pill groups
                        Sort moved to column header (§5). */}
                    <div className="px-4 py-3.5 border-b border-slate-100 bg-white flex flex-col gap-3">
                        {/* Row 1: search + dropdowns */}
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <div className="relative flex-[2] min-w-[180px]">
                                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                <input
                                    type="text"
                                    value={filterSearch}
                                    onChange={e => setFilterSearch(e.target.value)}
                                    placeholder="Search title, ID..."
                                    aria-label="Search test cases"
                                    className="w-full pl-8 pr-3 py-2 text-[13px] border border-black/[0.08] rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                />
                            </div>

                            {/* Assignee — three special buckets (Any / Mine /
                                Unassigned) plus the per-user list. The three
                                bool/string state fields stay (changing them
                                would ripple into filteredResults); we only
                                fold them into one <select> for the UI. */}
                            <select
                                value={
                                    filterAssignToMe ? '__mine'
                                    : filterUnassigned ? '__unassigned'
                                    : filterAssigneeId !== '' ? filterAssigneeId
                                    : ''
                                }
                                onChange={e => {
                                    const v = e.target.value;
                                    setFilterAssignToMe(v === '__mine');
                                    setFilterUnassigned(v === '__unassigned');
                                    setFilterAssigneeId(v === '__mine' || v === '__unassigned' || v === '' ? '' : v);
                                }}
                                aria-label="Filter by assignee"
                                className="flex-1 min-w-[150px] px-2.5 py-2 text-[13px] border border-black/[0.08] rounded-md hover:border-primary-500 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                                <option value="">Assignee: Any</option>
                                <option value="__mine">Mine</option>
                                <option value="__unassigned">Unassigned</option>
                                {allAssignees.length > 0 && <option disabled>──────────</option>}
                                {allAssignees.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
                            </select>

                            <select
                                value={filterLabel}
                                onChange={e => setFilterLabel(e.target.value)}
                                aria-label="Filter by label"
                                className="flex-1 min-w-[120px] px-2.5 py-2 text-[13px] border border-black/[0.08] rounded-md hover:border-primary-500 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                                <option value="">Labels</option>
                                {allLabels.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>

                            <select
                                value={filterTag}
                                onChange={e => setFilterTag(e.target.value)}
                                aria-label="Filter by tag"
                                className="flex-1 min-w-[120px] px-2.5 py-2 text-[13px] border border-black/[0.08] rounded-md hover:border-primary-500 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                                <option value="">Tags</option>
                                {allTags.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>

                            {activeFilterCount > 0 && (
                                <button
                                    type="button"
                                    onClick={clearAllFilters}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900"
                                    title="清除所有篩選"
                                >
                                    <X className="w-3.5 h-3.5" /> Clear
                                </button>
                            )}
                        </div>

                        {/* Row 2: Result + Priority pills, divider between */}
                        <div className="flex items-center gap-3 flex-wrap">
                            <PillGroup
                                label="Result"
                                type="round"
                                options={RESULT_PILL_OPTIONS}
                                value={new Set(filterStatus)}
                                onChange={next => setFilterStatus([...next])}
                            />
                            <div className="w-px h-4 bg-black/[0.08]" />
                            <PillGroup
                                label="Priority"
                                type="square"
                                options={PRIORITY_PILL_OPTIONS.map(opt => ({
                                    ...opt,
                                    dimmed: !presentPriorities.has(opt.value),
                                }))}
                                value={new Set(filterPriority)}
                                onChange={next => setFilterPriority([...next])}
                            />
                        </div>
                    </div>

                    {/* Unassigned hint bar */}
                    {filterUnassigned && filteredResults.length > 0 && selectedRows.size === 0 && (
                        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border-b border-amber-100 text-sm">
                            <span className="text-amber-700 font-medium">
                                {filteredResults.length} unassigned case{filteredResults.length > 1 ? 's' : ''} shown
                            </span>
                            <button
                                type="button"
                                onClick={() => setSelectedRows(new Set(filteredResults.map(r => r.id)))}
                                className="px-3 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold rounded-md text-xs transition-colors border border-amber-200"
                            >
                                Select all
                            </button>
                            <span className="text-amber-600 text-xs">→ then use batch apply to assign</span>
                        </div>
                    )}

                    {/* ── Batch action bar ─────────────────────────────────────── */}
                    {selectedRows.size > 0 && (
                        <div className="flex items-center gap-3 px-6 py-3 bg-primary-50 border-b border-primary-100 flex-wrap">
                            <span className="text-sm font-semibold text-primary-700">{selectedRows.size} selected</span>

                            <div className="flex items-center gap-2 ml-auto flex-wrap">
                                {/* Batch Status */}
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-slate-600 font-medium">Status:</span>
                                    <select
                                        value={batchStatus}
                                        onChange={e => setBatchStatus(e.target.value)}
                                        className="text-sm rounded-md border-slate-300 py-1.5 pl-2 pr-8 shadow-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 bg-white"
                                    >
                                        <option value="">— Keep —</option>
                                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>

                                {/* Batch Assignee */}
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-slate-600 font-medium">Assign to:</span>
                                    <select
                                        value={batchAssigneeId}
                                        onChange={e => setBatchAssigneeId(e.target.value)}
                                        className="text-sm rounded-md border-slate-300 py-1.5 pl-2 pr-8 shadow-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 bg-white"
                                    >
                                        <option value={ASSIGNEE_KEEP}>— Keep —</option>
                                        <option value={ASSIGNEE_UNASSIGN}>Unassign</option>
                                        {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
                                    </select>
                                </div>

                                <button
                                    onClick={handleBatchApply}
                                    disabled={!batchStatus && !batchAssigneeId}
                                    className="px-4 py-1.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                                >
                                    Apply
                                </button>
                                <button
                                    onClick={() => { setSelectedRows(new Set()); setBatchStatus(''); setBatchAssigneeId(ASSIGNEE_KEEP); }}
                                    className="px-3 py-1.5 text-sm font-medium text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Table ────────────────────────────────────────────────── */}
                    <table className="w-full text-left border-collapse table-fixed">
                        <colgroup>
                            <col className="w-10" />
                            <col />
                            <col className="w-24" />
                            <col className="w-44" />
                            <col className="w-44" />
                        </colgroup>
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr className="text-xs text-slate-500 uppercase tracking-wider">
                                <th className="py-3 px-4 border-b border-slate-200">
                                    <input
                                        type="checkbox"
                                        checked={selectedRows.size === filteredResults.length && filteredResults.length > 0}
                                        onChange={toggleAll}
                                        className="size-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
                                    />
                                </th>
                                <SortableHeader
                                    label="Case Title"
                                    sortKey="case"
                                    currentKey={sortKey}
                                    currentDirection={sortDirection}
                                    onSort={handleSort}
                                    className="px-6 text-left"
                                />
                                <SortableHeader
                                    label="Priority"
                                    sortKey="priority"
                                    currentKey={sortKey}
                                    currentDirection={sortDirection}
                                    onSort={handleSort}
                                    className="px-4 text-left"
                                />
                                <SortableHeader
                                    label="Result"
                                    sortKey="result"
                                    currentKey={sortKey}
                                    currentDirection={sortDirection}
                                    onSort={handleSort}
                                    className="px-4 text-left"
                                />
                                <SortableHeader
                                    label="Assignee"
                                    sortKey="assignee"
                                    currentKey={sortKey}
                                    currentDirection={sortDirection}
                                    onSort={handleSort}
                                    className="px-4 text-left"
                                />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredResults.map((res) => {
                                const currentStatus = unsavedStatuses[res.id] ?? res.status;
                                const isStatusDirty = currentStatus !== res.status;
                                const currentAssignee = unsavedAssignees[res.id] ?? '';
                                const isAssigneeDirty = currentAssignee !== (res.assignee_id ? String(res.assignee_id) : '');
                                const isDirty = isStatusDirty || isAssigneeDirty;

                                return (
                                    <tr
                                        key={res.id}
                                        onClick={() => setSelectedResultId(res.id)}
                                        className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${selectedRows.has(res.id) ? 'bg-primary-50/40' : ''} ${isDirty ? 'border-l-2 border-l-amber-400' : ''}`}
                                    >
                                        {/* Checkbox */}
                                        <td className="py-3.5 px-4 w-10" onClick={e => { e.stopPropagation(); toggleRow(res.id); }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedRows.has(res.id)}
                                                onChange={() => toggleRow(res.id)}
                                                className="size-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
                                            />
                                        </td>

                                        {/* Case title */}
                                        <td className="py-3.5 px-6 font-medium text-slate-900">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-xs font-mono text-slate-400" data-case-id={res.case_id}>
                                                    {/* Show the KQT external_id (deep-links to the case in Repository); the internal TC id is hidden but still used by the ?case= link and the data-case-id attr (for e2e ordering checks). */}
                                                    <Link
                                                        to={`/repository?case=${res.case_id}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        onClick={e => e.stopPropagation()}
                                                        className="text-primary-600 hover:underline"
                                                    >
                                                        {caseLabel({ external_id: res.test_case?.external_id, id: res.case_id })}
                                                    </Link>
                                                </span>
                                                <span>{res.test_case?.title || 'Unknown Case'}</span>
                                            </div>
                                        </td>

                                        {/* Priority */}
                                        <td className="py-3.5 px-4 text-sm text-slate-600">
                                            {res.test_case?.priority || 'Unknown'}
                                        </td>

                                        {/* Result dropdown */}
                                        <td className="py-3.5 px-4" onClick={e => e.stopPropagation()}>
                                            <select
                                                value={currentStatus}
                                                onChange={e => handleStatusChange(res.id, e.target.value)}
                                                className={`w-full text-xs font-semibold rounded-md py-1.5 pl-2 pr-6 border cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors
                                                    ${STATUS_SELECT_STYLES[currentStatus] || STATUS_SELECT_STYLES['Untested']}
                                                    ${isStatusDirty ? 'ring-1 ring-amber-400' : ''}`}
                                            >
                                                {STATUS_OPTIONS.map(s => (
                                                    <option key={s} value={s}>{s}</option>
                                                ))}
                                            </select>
                                        </td>

                                        {/* Assignee dropdown */}
                                        <td className="py-3.5 px-4" onClick={e => e.stopPropagation()}>
                                            <select
                                                value={currentAssignee}
                                                onChange={e => handleAssignChange(res.id, e.target.value)}
                                                className={`w-full text-xs rounded-md border-slate-200 py-1.5 pl-2 pr-6 text-slate-700 shadow-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 bg-white hover:bg-slate-50 cursor-pointer
                                                    ${isAssigneeDirty ? 'border-amber-400 ring-1 ring-amber-400' : ''}`}
                                            >
                                                <option value="">Unassigned</option>
                                                {users.map(u => (
                                                    <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
                                                ))}
                                            </select>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {filteredResults.length === 0 && (
                        <div className="p-8 text-center text-slate-500">
                            {activeFilterCount > 0 ? (
                                <p>No cases match your filters. <button onClick={clearAllFilters} className="text-primary-600 underline ml-1">Clear filters</button></p>
                            ) : (
                                <p>No test cases found in this run.</p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <TestCaseExecutionPane
                resultId={selectedResultId}
                onClose={() => setSelectedResultId(null)}
                onUpdated={fetchDataPreservingScroll}
            />

            <EditRunModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                run={testRun}
                folders={folders}
                onUpdated={fetchData}
            />
        </div>
    );
}
