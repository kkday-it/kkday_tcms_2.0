import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Search, Folder, ChevronRight, ChevronDown, Filter } from 'lucide-react';
import api from '../../lib/api';

interface TestSuite {
    id: number;
    name: string;
    parent_suite_id: number | null;
}

interface TestCase {
    id: number;
    title: string;
    suite_id: number;
    status: string;
    priority: string;
    automation_status: string;
    assignee_id?: number | null;
    tags?: string;
    labels?: string;
}

interface TestRunFolder {
    id: number;
    name: string;
    parent_id?: number | null;
}

interface TestRun {
    id: number;
    project_id: number;
    title: string;
    run_type?: string;
    status?: string;
    folder_id?: number | null;
    assignee_id?: number | null;
    assignees?: { id: number; username: string; full_name?: string }[];
}

interface User {
    id: number;
    username: string;
    full_name: string;
}

interface EditRunModalProps {
    isOpen: boolean;
    onClose: () => void;
    run: TestRun | null;
    folders: TestRunFolder[];
    onUpdated: () => void;
}

export default function EditRunModal({ isOpen, onClose, run, folders, onUpdated }: EditRunModalProps) {
    const [title, setTitle] = useState('');
    const [runType, setRunType] = useState('Feature Test');
    const [runStatus, setRunStatus] = useState('Active');
    const [folderId, setFolderId] = useState<number | ''>('');
    const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [suites, setSuites] = useState<TestSuite[]>([]);
    const [cases, setCases] = useState<TestCase[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(false);

    // UI state
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedSuites, setExpandedSuites] = useState<Set<number>>(new Set());
    const [selectedCaseIds, setSelectedCaseIds] = useState<Set<number>>(new Set());
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // Advanced Filters
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [filterPriority, setFilterPriority] = useState<string>('');
    const [filterAutomation, setFilterAutomation] = useState<string>('');
    const [filterAssignee, setFilterAssignee] = useState<string>('');
    const [filterTags, setFilterTags] = useState<string>('');
    const [filterLabels, setFilterLabels] = useState<string>('');

    useEffect(() => {
        if (isOpen && run) {
            setTitle(run.title);
            setRunType(run.run_type || 'Feature Test');
            setRunStatus(run.status || 'Active');
            setFolderId(run.folder_id ?? '');
            // Initialize assignees from the run's existing assignees
            setAssigneeIds((run.assignees || []).map(a => a.id));

            // Clear advanced filters on open
            clearFilters();

            fetchData(run.project_id, run.id, run.run_type || 'Feature Test');
        } else {
            // Reset state
            setTitle('');
            setRunType('Feature Test');
            setRunStatus('Active');
            setFolderId('');
            setAssigneeIds([]);
            setSelectedCaseIds(new Set());
            setSearchQuery('');
            setExpandedSuites(new Set());
            clearFilters();
        }
    }, [isOpen, run]);

    const clearFilters = () => {
        setFilterStatus('');
        setFilterPriority('');
        setFilterAutomation('');
        setFilterAssignee('');
        setFilterTags('');
        setFilterLabels('');
    };

    // When Run Type changes, re-fetch cases to apply exclusions automatically
    useEffect(() => {
        if (isOpen && run) {
            fetchCasesForRunType(run.project_id, runType);
        }
    }, [runType, isOpen]);

    const fetchData = async (projectId: number, runId: number, initialRunType: string) => {
        setIsLoadingData(true);
        try {
            // Fetch layout data
            const [suitesRes, usersRes, runDetailsRes] = await Promise.all([
                api.get(`/suites/project/${projectId}`),
                api.get(`/users`),
                api.get(`/results/run/${runId}?include_all=true`) // Need to hit an endpoint that returns existing results for this run
            ]);

            setSuites(suitesRes.data);
            setUsers(usersRes.data);

            // Fetch cases (this will apply the initial Run Type filtering)
            await fetchCasesForRunType(projectId, initialRunType);

            // Pre-select existing cases using the test results
            const existingCaseIds = runDetailsRes.data.map((r: any) => r.case_id);
            setSelectedCaseIds(new Set(existingCaseIds));

            // Expand all root suites by default
            const fetchedSuites = suitesRes.data;
            const rootSuiteIds = fetchedSuites.filter((s: TestSuite) => s.parent_suite_id === null).map((s: TestSuite) => s.id);
            setExpandedSuites(new Set(rootSuiteIds));
        } catch (error) {
            console.error("Failed to fetch edit run data:", error);
        } finally {
            setIsLoadingData(false);
        }
    };

    const fetchCasesForRunType = async (projectId: number, type: string) => {
        setIsLoadingData(true);
        try {
            // Build query params based on run type
            let queryStr = "";
            if (type === 'Feature Test') {
                // If Feature test, drop Regression cases
                queryStr = "?exclude_tags=Regression&exclude_labels=Regression";
            } else if (type === 'Hotfix') {
                // Example of future expandability
            }

            const casesRes = await api.get(`/cases/project/${projectId}${queryStr}`);
            setCases(casesRes.data);

            // Note: In an Edit modal, we DO NOT automatically alter `selectedCaseIds` here.
            // If they change Run Type, the newly hidden cases may theoretically still be "selected" internally, 
            // but won't be visible. When saved, the current state of selectedCaseIds dictates the update.
            // If you wanted to clear selection of excluded cases, you would intersect the sets here.
        } catch (error) {
            console.error("Failed to fetch cases for run type:", error);
        } finally {
            setIsLoadingData(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!run || !title.trim() || selectedCaseIds.size === 0) return;

        setIsSubmitting(true);
        try {
            await api.put(`/runs/${run.id}`, {
                title: title.trim(),
                run_type: runType,
                status: runStatus,
                folder_id: folderId === '' ? null : folderId,
                assignee_ids: assigneeIds,
                case_ids: Array.from(selectedCaseIds)
            });
            onUpdated();
            onClose();
        } catch (error) {
            console.error("Failed to update test run:", error);
            alert("Failed to update test run.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Filter & Tree Logic ---

    // Apply advanced filters and search query
    const filteredCases = useMemo(() => {
        return cases.filter(c => {
            // Text Search
            if (searchQuery) {
                const lowerQ = searchQuery.toLowerCase();
                const textMatch = c.title.toLowerCase().includes(lowerQ) || c.id.toString().includes(lowerQ);
                if (!textMatch) return false;
            }

            // Advanced Filters
            if (filterStatus && c.status !== filterStatus) return false;
            if (filterPriority && c.priority !== filterPriority) return false;
            if (filterAutomation && c.automation_status !== filterAutomation) return false;

            if (filterAssignee) {
                if (filterAssignee === 'unassigned' && c.assignee_id != null) return false;
                if (filterAssignee !== 'unassigned' && c.assignee_id !== Number(filterAssignee)) return false;
            }

            if (filterTags) {
                const searchTags = filterTags.toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
                const caseTags = (c.tags || '').toLowerCase();
                if (!searchTags.some(t => caseTags.includes(t))) return false;
            }

            if (filterLabels) {
                const searchLabels = filterLabels.toLowerCase().split(',').map(l => l.trim()).filter(Boolean);
                const caseLabels = (c.labels || '').toLowerCase();
                if (!searchLabels.some(l => caseLabels.includes(l))) return false;
            }

            return true;
        });
    }, [cases, searchQuery, filterStatus, filterPriority, filterAutomation, filterAssignee, filterTags, filterLabels]);


    const toggleSuiteExpanded = (e: React.MouseEvent, suiteId: number) => {
        e.stopPropagation();
        setExpandedSuites(prev => {
            const next = new Set(prev);
            if (next.has(suiteId)) next.delete(suiteId);
            else next.add(suiteId);
            return next;
        });
    };

    // Recursively gets all cases under a suite
    const getCasesRecursively = (targetSuiteId: number): number[] => {
        const childSuites = suites.filter(s => s.parent_suite_id === targetSuiteId);
        let caseIds = cases.filter(c => c.suite_id === targetSuiteId).map(c => c.id);
        for (const childSuite of childSuites) {
            caseIds = [...caseIds, ...getCasesRecursively(childSuite.id)];
        }
        return caseIds;
    };

    const toggleSuiteSelection = (e: React.ChangeEvent<HTMLInputElement>, targetSuiteId: number) => {
        e.stopPropagation();
        const checked = e.target.checked;
        const allAssociatedCaseIds = getCasesRecursively(targetSuiteId);

        setSelectedCaseIds(prev => {
            const next = new Set(prev);
            if (checked) {
                allAssociatedCaseIds.forEach(id => next.add(id));
            } else {
                allAssociatedCaseIds.forEach(id => next.delete(id));
            }
            return next;
        });
    };

    const toggleCaseSelection = (e: React.ChangeEvent<HTMLInputElement>, caseId: number) => {
        e.stopPropagation();
        const checked = e.target.checked;
        setSelectedCaseIds(prev => {
            const next = new Set(prev);
            if (checked) next.add(caseId);
            else next.delete(caseId);
            return next;
        });
    };

    const renderSuite = (suite: TestSuite, level: number = 0) => {
        const childSuites = suites.filter(s => s.parent_suite_id === suite.id);
        const childCases = filteredCases.filter(c => c.suite_id === suite.id);

        // Hide suite if searching/filtering and it has no matching elements recursively
        const hasMatchingContent = () => {
            const hasFilters = searchQuery || filterStatus || filterPriority || filterAutomation || filterAssignee || filterTags || filterLabels;
            if (!hasFilters) return true;
            if (childCases.length > 0) return true;
            for (const cs of childSuites) {
                const subCases = getCasesRecursively(cs.id);
                if (filteredCases.some(fc => subCases.includes(fc.id))) return true;
            }
            return false;
        };

        if (!hasMatchingContent()) return null;

        const allCasesInSuite = getCasesRecursively(suite.id);
        const selectedCasesInSuiteCount = allCasesInSuite.filter(id => selectedCaseIds.has(id)).length;

        let isIndeterminate = false;
        let isChecked = false;

        if (allCasesInSuite.length > 0) {
            if (selectedCasesInSuiteCount === allCasesInSuite.length) {
                isChecked = true;
            } else if (selectedCasesInSuiteCount > 0) {
                isIndeterminate = true;
            }
        }

        const hasFilters = searchQuery || filterStatus || filterPriority || filterAutomation || filterAssignee || filterTags || filterLabels;
        const isExpanded = expandedSuites.has(suite.id) || !!hasFilters;
        const paddingLeft = level * 20 + 8;

        return (
            <div key={`suite-${suite.id}`} className="flex flex-col">
                <div
                    className="flex items-center hover:bg-slate-50 py-1.5 cursor-pointer rounded transition-colors group"
                    style={{ paddingLeft: `${paddingLeft}px`, paddingRight: '12px' }}
                    onClick={(e) => toggleSuiteExpanded(e, suite.id)}
                >
                    <button className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors mr-1">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>

                    <input
                        type="checkbox"
                        checked={isChecked}
                        ref={input => {
                            if (input) {
                                input.indeterminate = isIndeterminate;
                            }
                        }}
                        onChange={(e) => toggleSuiteSelection(e, suite.id)}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 text-primary-600 rounded border-slate-300 focus:ring-primary-500 mr-2.5"
                    />
                    <Folder className="w-4 h-4 text-indigo-400 mr-2 flex-shrink-0" />
                    <span className="text-sm font-medium text-slate-800 flex-1 truncate">{suite.name}</span>
                    <span className="text-xs text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        {selectedCasesInSuiteCount}/{allCasesInSuite.length} selected
                    </span>
                </div>

                {isExpanded && (
                    <div className="flex flex-col">
                        {childSuites.map(child => renderSuite(child, level + 1))}
                        {childCases.map(c => (
                            <label
                                key={`case-${c.id}`}
                                className="flex items-center py-1.5 hover:bg-slate-50 cursor-pointer rounded"
                                style={{ paddingLeft: `${paddingLeft + 32}px`, paddingRight: '12px' }}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedCaseIds.has(c.id)}
                                    onChange={(e) => toggleCaseSelection(e, c.id)}
                                    className="w-4 h-4 text-primary-600 rounded border-slate-300 focus:ring-primary-500 mr-3"
                                />
                                <span className="text-xs text-slate-400 font-mono w-14">TC-{c.id}</span>
                                <span className="text-sm text-slate-700 truncate">{c.title}</span>
                            </label>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const rootSuites = suites.filter(s => s.parent_suite_id === null || !suites.find(parent => parent.id === s.parent_suite_id));
    const rootCases = filteredCases.filter(c => c.suite_id === null || !suites.find(s => s.id === c.suite_id));

    if (!isOpen || !run) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-900">Edit Test Run</h2>
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
                        className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col p-6">
                    <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-1">
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Run Title <span className="text-rose-500">*</span></label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g., Release v1.6 Verification"
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Run Type</label>
                            <select
                                value={runType}
                                onChange={(e) => setRunType(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all bg-white font-medium text-slate-700"
                            >
                                <option value="Feature Test">Feature Test</option>
                                <option value="Regression (UI)">Regression (UI)</option>
                                <option value="Regression (API)">Regression (API)</option>
                                <option value="Sanity">Sanity</option>
                                <option value="Hotfix">Hotfix</option>
                                <option value="Project">Project</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
                            <select
                                value={runStatus}
                                onChange={(e) => setRunStatus(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all bg-white"
                            >
                                <option value="Pending">Pending</option>
                                <option value="Active">Active</option>
                                <option value="Testing">Testing</option>
                                <option value="Done">Done</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Folder</label>
                            <select
                                value={folderId}
                                onChange={(e) => setFolderId(e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all bg-white"
                            >
                                <option value="">(No Folder)</option>
                                {folders.map(f => (
                                    <option key={f.id} value={f.id}>{f.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* ── Assignee Tag Picker (Jira-style) ─────────────────────────────── */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Assign To</label>
                        {/* Selected assignees as removable chips */}
                        <div className="flex flex-wrap items-center gap-2 min-h-[36px] p-2 border border-slate-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent transition-all">
                            {assigneeIds.map(id => {
                                const u = users.find(x => x.id === id);
                                if (!u) return null;
                                return (
                                    <span
                                        key={id}
                                        className="flex items-center gap-1.5 pl-1.5 pr-1 py-0.5 bg-primary-50 border border-primary-200 text-primary-800 rounded-full text-xs font-medium"
                                    >
                                        <span className="w-4 h-4 rounded-full bg-primary-600 text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                                            {u.username.charAt(0).toUpperCase()}
                                        </span>
                                        {u.username}
                                        <button
                                            type="button"
                                            onClick={() => setAssigneeIds(prev => prev.filter(x => x !== id))}
                                            className="ml-0.5 w-3.5 h-3.5 rounded-full bg-primary-200 hover:bg-primary-400 text-primary-700 hover:text-white flex items-center justify-center transition-colors shrink-0"
                                            title={`Remove ${u.username}`}
                                        >
                                            ×
                                        </button>
                                    </span>
                                );
                            })}
                            {/* Dropdown to add more */}
                            {users.filter(u => !assigneeIds.includes(u.id)).length > 0 && (
                                <select
                                    value=""
                                    onChange={e => {
                                        const id = Number(e.target.value);
                                        if (id) setAssigneeIds(prev => [...prev, id]);
                                    }}
                                    className="flex-1 min-w-32 text-sm text-slate-400 border-0 focus:ring-0 outline-none bg-transparent cursor-pointer py-0.5"
                                >
                                    <option value="" disabled>+ Add assignee...</option>
                                    {users.filter(u => !assigneeIds.includes(u.id)).map(u => (
                                        <option key={u.id} value={u.id}>{u.username}</option>
                                    ))}
                                </select>
                            )}
                            {assigneeIds.length > 0 && users.filter(u => !assigneeIds.includes(u.id)).length === 0 && (
                                <span className="text-xs text-slate-400 italic">All users assigned</span>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col min-h-0 border border-slate-200 rounded-lg overflow-hidden bg-white">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between z-10">
                            <h3 className="font-semibold text-slate-800 text-sm">Select Test Cases</h3>
                            <div className="flex items-center gap-4">
                                <span className="text-sm font-medium text-primary-700 bg-primary-50 px-2 py-0.5 rounded">
                                    {selectedCaseIds.size} / {cases.length} selected
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                                    className={`flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-md transition-colors ${isFilterOpen ? 'bg-primary-100 text-primary-700' : 'text-slate-600 hover:bg-slate-200'}`}
                                >
                                    <Filter className="w-4 h-4" /> Filter
                                </button>
                            </div>
                        </div>

                        {/* Advanced Filters Panel */}
                        {isFilterOpen && (
                            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 z-10 shadow-inner">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Status</label>
                                    <select
                                        value={filterStatus}
                                        onChange={(e) => setFilterStatus(e.target.value)}
                                        className="w-full text-xs rounded border-slate-300 py-1"
                                    >
                                        <option value="">All</option>
                                        <option value="Active">Active</option>
                                        <option value="Draft">Draft</option>
                                        <option value="Deprecated">Deprecated</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Priority</label>
                                    <select
                                        value={filterPriority}
                                        onChange={(e) => setFilterPriority(e.target.value)}
                                        className="w-full text-xs rounded border-slate-300 py-1"
                                    >
                                        <option value="">All</option>
                                        <option value="High">High</option>
                                        <option value="Medium">Medium</option>
                                        <option value="Low">Low</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Automation</label>
                                    <select
                                        value={filterAutomation}
                                        onChange={(e) => setFilterAutomation(e.target.value)}
                                        className="w-full text-xs rounded border-slate-300 py-1"
                                    >
                                        <option value="">All</option>
                                        <option value="Automated">Automated</option>
                                        <option value="Manual">Manual</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Assignee</label>
                                    <select
                                        value={filterAssignee}
                                        onChange={(e) => setFilterAssignee(e.target.value)}
                                        className="w-full text-xs rounded border-slate-300 py-1"
                                    >
                                        <option value="">All</option>
                                        <option value="unassigned">Unassigned</option>
                                        {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Tags</label>
                                    <input
                                        type="text"
                                        placeholder="Comma separated..."
                                        value={filterTags}
                                        onChange={(e) => setFilterTags(e.target.value)}
                                        className="w-full text-xs rounded border-slate-300 py-1 px-2"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Labels</label>
                                    <input
                                        type="text"
                                        placeholder="Comma separated..."
                                        value={filterLabels}
                                        onChange={(e) => setFilterLabels(e.target.value)}
                                        className="w-full text-xs rounded border-slate-300 py-1 px-2"
                                    />
                                </div>
                                <div className="col-span-full flex justify-end">
                                    <button
                                        type="button"
                                        onClick={clearFilters}
                                        className="text-xs font-medium text-slate-500 hover:text-slate-800"
                                    >
                                        Clear Filters
                                    </button>
                                </div>
                            </div>
                        )}

                        {isLoadingData ? (
                            <div className="flex-1 flex items-center justify-center bg-white">
                                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col bg-white overflow-hidden">
                                <div className="px-4 pt-4 pb-2">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Search case title or ID..."
                                            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1">
                                    {rootSuites.map(s => renderSuite(s, 0))}
                                    {rootCases.map(c => (
                                        <label
                                            key={`case-${c.id}`}
                                            className="flex items-center py-1.5 hover:bg-slate-50 cursor-pointer rounded"
                                            style={{ paddingLeft: `8px`, paddingRight: '12px' }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedCaseIds.has(c.id)}
                                                onChange={(e) => toggleCaseSelection(e, c.id)}
                                                className="w-4 h-4 text-primary-600 rounded border-slate-300 focus:ring-primary-500 mr-3"
                                            />
                                            <span className="text-xs text-slate-400 font-mono w-14">TC-{c.id}</span>
                                            <span className="text-sm text-slate-700 truncate">{c.title}</span>
                                        </label>
                                    ))}
                                    {filteredCases.length === 0 && (
                                        <div className="text-center text-sm text-slate-500 mt-8">
                                            No cases found matching filters.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 rounded-b-xl">
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
                        className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleUpdate}
                        disabled={isSubmitting || !title.trim() || selectedCaseIds.size === 0}
                        className="btn-primary"
                    >
                        {isSubmitting ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                        ) : (
                            'Save Changes'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
