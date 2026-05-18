import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { Loader2, ArrowLeft, CheckCircle2, XCircle, SkipForward, Edit2, Filter, X, Save, Ban } from 'lucide-react';
import api from '../lib/api';
import { useUsers } from '../lib/useUsers';
import TestCaseExecutionPane from '../components/runs/TestCaseExecutionPane';
import EditRunModal from '../components/runs/EditRunModal';

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

const STATUS_OPTIONS = ['Passed', 'Failed', 'Untested', 'Blocked'];



const STATUS_SELECT_STYLES: Record<string, string> = {
    Passed: 'border-green-300 bg-green-50 text-green-700',
    Failed: 'border-red-300 bg-red-50 text-red-700',
    Blocked: 'border-amber-300 bg-amber-50 text-amber-700',
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
    const resultListRef = useRef<HTMLDivElement>(null);

    // Local unsaved state maps: resultId → value
    const [unsavedStatuses, setUnsavedStatuses] = useState<Record<number, string>>({});
    const [unsavedAssignees, setUnsavedAssignees] = useState<Record<number, string>>({});
    const { users } = useUsers();

    // Batch selection
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
    const [batchAssigneeId, setBatchAssigneeId] = useState<string>('');
    const [batchStatus, setBatchStatus] = useState<string>('');

    // Edit modal
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [folders, setFolders] = useState<{ id: number; name: string }[]>([]);

    // ── FILTERS ──────────────────────────────────────────────────────────────
    const [showFilters, setShowFilters] = useState(false);
    const [filterAssignToMe, setFilterAssignToMe] = useState(false);
    const [filterUnassigned, setFilterUnassigned] = useState(false);
    const [filterStatus, setFilterStatus] = useState<string[]>([]);
    const [filterLabel, setFilterLabel] = useState('');
    const [filterTag, setFilterTag] = useState('');
    const [filterSearch, setFilterSearch] = useState('');

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
            if (filterStatus.length > 0) {
                if (!filterStatus.includes(r.status)) return false;
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
        // KQT-15251: sort by case_id ascending so TC-5514 appears above TC-5594.
        return [...filtered].sort((a, b) => a.case_id - b.case_id);
    }, [results, filterSearch, filterAssignToMe, filterUnassigned, filterStatus, filterLabel, filterTag, currentUserId]);

    const activeFilterCount = [
        filterAssignToMe, filterUnassigned,
        filterStatus.length > 0, filterLabel !== '', filterTag !== '', filterSearch !== ''
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

    /** Batch apply – status and/or assignee */
    const handleBatchApply = async () => {
        if (!batchStatus && !batchAssigneeId) return;
        try {
            await Promise.all([...selectedRows].map(resultId => {
                const payload: Record<string, any> = {};
                if (batchStatus) payload.status = batchStatus;
                if (batchAssigneeId !== undefined) payload.assignee_id = batchAssigneeId ? Number(batchAssigneeId) : null;
                return api.put(`/results/${resultId}`, payload);
            }));
            setSelectedRows(new Set());
            setBatchAssigneeId('');
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

    const handleCompleteRun = async () => {
        if (!window.confirm('Mark this run as Done?')) return;
        try {
            await api.put(`/runs/${runId}`, { status: 'Done' });
            fetchData();
        } catch (error) {
            console.error('Failed to complete run', error);
        }
    };

    const toggleStatusFilter = (s: string) => {
        setFilterStatus(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
    };

    const clearAllFilters = () => {
        setFilterAssignToMe(false);
        setFilterUnassigned(false);
        setFilterStatus([]);
        setFilterLabel('');
        setFilterTag('');
        setFilterSearch('');
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-50">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            </div>
        );
    }

    const passed = results.filter(r => r.status === 'Passed').length;
    const failed = results.filter(r => r.status === 'Failed').length;
    const blocked = results.filter(r => r.status === 'Blocked').length;
    const total = results.length;
    // Calculate untested as anything not P/F/B to ensure consistency
    const unt = total - (passed + failed + blocked);
    const passPct = total > 0 ? (passed / total) * 100 : 0;
    const failPct = total > 0 ? (failed / total) * 100 : 0;
    const blockedPct = total > 0 ? (blocked / total) * 100 : 0;

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50 relative overflow-hidden">
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="px-8 py-6 border-b border-slate-200 bg-white shadow-sm z-10">
                <div className="flex items-center gap-4 mb-4">
                    <Link to={fromFolder ? `/runs?folder=${fromFolder}` : testRun?.folder_id ? `/runs?folder=${testRun.folder_id}` : '/runs'} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900">{testRun?.title || 'Test Run Execution'}</h1>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium border bg-primary-50 text-primary-700 border-primary-200">
                        {testRun?.run_type || 'Feature Test'}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${testRun?.status === 'Done' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-primary-50 text-primary-700 border-primary-200'}`}>
                        {testRun?.status || 'Pending'}
                    </span>

                    <div className="ml-auto flex items-center gap-3">
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

                        <button
                            onClick={() => setIsEditModalOpen(true)}
                            className="px-4 py-2 bg-white text-slate-700 border border-slate-200 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors shadow-sm flex items-center gap-2"
                        >
                            <Edit2 className="w-4 h-4" /> Edit Run
                        </button>
                        {testRun?.status !== 'Done' && (
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
                            <SkipForward className="w-4 h-4 text-slate-400" /> <span className="font-semibold text-slate-500">{unt}</span> Untested
                        </div>
                    </div>

                    <div className="w-full md:w-96">
                        <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1.5">
                            <span>Progress</span>
                            <span>{Math.round(((passed + failed + blocked) / total) * 100) || 0}% Completed</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex shadow-inner border border-slate-200/30">
                            <div style={{ width: `${passPct}%` }} className="bg-emerald-500 h-full transition-all duration-500 ease-out"></div>
                            <div style={{ width: `${failPct}%` }} className="bg-rose-500 h-full transition-all duration-500 ease-out border-l border-white/10"></div>
                            <div style={{ width: `${blockedPct}%` }} className="bg-amber-400 h-full transition-all duration-500 ease-out border-l border-white/10"></div>
                            <div style={{ width: `${(100 - passPct - failPct - blockedPct)}%` }} className="bg-slate-200 h-full transition-all duration-500 ease-out border-l border-white/10"></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── List ────────────────────────────────────────────────────────── */}
            <div ref={resultListRef} className="flex-1 overflow-y-auto w-full p-8">
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

                    {/* ── Filter Bar ─────────────────────────────────────────────── */}
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center gap-3">
                        <input
                            type="text"
                            value={filterSearch}
                            onChange={e => setFilterSearch(e.target.value)}
                            placeholder="Search title, ID..."
                            className="flex-1 min-w-48 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white"
                        />

                        <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white cursor-pointer hover:border-primary-400 transition-colors text-sm font-medium text-slate-700 select-none">
                            <input
                                type="checkbox"
                                checked={filterAssignToMe}
                                onChange={e => { setFilterAssignToMe(e.target.checked); if (e.target.checked) setFilterUnassigned(false); }}
                                className="w-3.5 h-3.5 rounded accent-primary-600"
                            />
                            Assign to me
                        </label>

                        <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white cursor-pointer hover:border-primary-400 transition-colors text-sm font-medium text-slate-700 select-none">
                            <input
                                type="checkbox"
                                checked={filterUnassigned}
                                onChange={e => { setFilterUnassigned(e.target.checked); if (e.target.checked) setFilterAssignToMe(false); }}
                                className="w-3.5 h-3.5 rounded accent-primary-600"
                            />
                            Unassigned
                        </label>

                        <div className="flex items-center gap-1">
                            {STATUS_OPTIONS.map(s => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => toggleStatusFilter(s)}
                                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${filterStatus.includes(s)
                                        ? s === 'Passed' ? 'bg-green-500 text-white border-green-600'
                                            : s === 'Failed' ? 'bg-red-500 text-white border-red-600'
                                                : s === 'Blocked' ? 'bg-amber-500 text-white border-amber-600'
                                                    : 'bg-slate-700 text-white border-slate-800'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                                        }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowFilters(f => !f)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${showFilters ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:border-primary-400'}`}
                        >
                            <Filter className="w-4 h-4" />
                            More {activeFilterCount > 0 && <span className="ml-0.5 bg-white/30 rounded-full px-1.5 text-xs">{activeFilterCount}</span>}
                        </button>

                        {activeFilterCount > 0 && (
                            <button
                                type="button"
                                onClick={clearAllFilters}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-500 hover:text-red-700 font-medium"
                            >
                                <X className="w-3.5 h-3.5" /> Clear
                            </button>
                        )}
                    </div>

                    {/* Advanced filter panel */}
                    {showFilters && (
                        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex flex-wrap gap-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Labels</label>
                                <select
                                    value={filterLabel}
                                    onChange={e => setFilterLabel(e.target.value)}
                                    className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 min-w-36"
                                >
                                    <option value="">All Labels</option>
                                    {allLabels.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tags</label>
                                <select
                                    value={filterTag}
                                    onChange={e => setFilterTag(e.target.value)}
                                    className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 min-w-36"
                                >
                                    <option value="">All Tags</option>
                                    {allTags.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>
                    )}

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
                                        <option value="">— Keep —</option>
                                        <option value="__unassign__">Unassign</option>
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
                                    onClick={() => { setSelectedRows(new Set()); setBatchStatus(''); setBatchAssigneeId(''); }}
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
                                <th className="py-3 font-semibold px-6 border-b border-slate-200">Case Title</th>
                                <th className="py-3 font-semibold px-4 border-b border-slate-200">Priority</th>
                                <th className="py-3 font-semibold px-4 border-b border-slate-200">Result</th>
                                <th className="py-3 font-semibold px-4 border-b border-slate-200">Assignee</th>
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
                                                <span className="text-xs font-mono text-slate-400">
                                                    TC-{res.case_id}
                                                    {res.test_case?.external_id && (
                                                        <span className="ml-1 px-1.5 py-0.5 bg-primary-50 text-primary-600 rounded whitespace-nowrap">
                                                            {res.test_case.external_id}
                                                        </span>
                                                    )}
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
