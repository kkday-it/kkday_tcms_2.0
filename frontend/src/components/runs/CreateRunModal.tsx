import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Search, Folder, ChevronRight, ChevronDown, Filter } from 'lucide-react';
import api from '../../lib/api';
import { useUsers } from '../../lib/useUsers';

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

interface CreateRunModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: number;
    initialTitle?: string;
    initialCaseIds?: number[];
    initialFolderId?: number | null;
    initialAssigneeIds?: number[];
    onCreated: (runId: number) => void;
}

export default function CreateRunModal({ isOpen, onClose, projectId, initialTitle, initialCaseIds, initialFolderId, initialAssigneeIds, onCreated }: CreateRunModalProps) {
    const [title, setTitle] = useState('');
    const [runType, setRunType] = useState('Feature Test');
    const [folderId, setFolderId] = useState<number | ''>('');
    const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [suites, setSuites] = useState<TestSuite[]>([]);
    const [cases, setCases] = useState<TestCase[]>([]);
    const [folders, setFolders] = useState<TestRunFolder[]>([]);
    const { users } = useUsers();
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
        if (isOpen) {
            setTitle(initialTitle || '');
            setFolderId(initialFolderId || '');

            // Clear advanced filters on open
            clearFilters();

            fetchData('Feature Test');
        } else {
            // Reset state when closed
            setTitle('');
            setRunType('Feature Test');
            setFolderId('');
            setAssigneeIds(initialAssigneeIds || []);
            setSelectedCaseIds(new Set());
            setSearchQuery('');
            setExpandedSuites(new Set());
            clearFilters();
        }
    }, [isOpen, initialTitle, initialCaseIds, initialFolderId]);

    // When Run Type changes, re-fetch cases to apply exclusions automatically
    useEffect(() => {
        if (isOpen) {
            fetchCasesForRunType(runType);
        }
    }, [runType, isOpen]);

    const clearFilters = () => {
        setFilterStatus('');
        setFilterPriority('');
        setFilterAutomation('');
        setFilterAssignee('');
        setFilterTags('');
        setFilterLabels('');
    };

    const fetchData = async (initialRunType: string) => {
        setIsLoadingData(true);
        try {
            const [suitesRes, foldersRes] = await Promise.all([
                api.get(`/suites/project/${projectId}`),
                api.get(`/run-folders/project/${projectId}`),
            ]);

            const fetchedSuites = suitesRes.data;
            setSuites(fetchedSuites);
            setFolders(foldersRes.data);

            // Fetch cases (this will apply the initial Run Type filtering)
            await fetchCasesForRunType(initialRunType, true);

            // By default, all suites collapsed
            setExpandedSuites(new Set());
        } catch (error) {
            console.error("Failed to fetch layout data:", error);
        } finally {
            setIsLoadingData(false);
        }
    };

    // The `isInitialLoad` flag tells us whether we should automatically select all visible cases
    const fetchCasesForRunType = async (type: string, isInitialLoad: boolean = false) => {
        setIsLoadingData(true);
        try {
            // Build query params based on run type
            let queryStr = "";
            if (type === 'Feature Test') {
                // If Feature test, drop Regression cases
                queryStr = "?exclude_tags=Regression&exclude_labels=Regression";
            }

            const casesRes = await api.get(`/cases/project/${projectId}${queryStr}`);
            const fetchedCases = casesRes.data;
            setCases(fetchedCases);

            if (isInitialLoad) {
                if (initialCaseIds) {
                    // If duplicating, only select the previously attached cases
                    setSelectedCaseIds(new Set(initialCaseIds));
                } else {
                    // Default: no cases pre-selected; user selects manually
                    setSelectedCaseIds(new Set());
                }
            } else {
                // Important: if the user manually switched Run Type, the fetched cases changed. 
                // Any newly hidden cases shouldn't cause errors, but we might want to automatically
                // remove them from `selectedCaseIds` so they aren't accidentally included in the run.
                // Let's do a set intersection:
                const visibleCaseIds = new Set(fetchedCases.map((c: any) => c.id));
                setSelectedCaseIds(prev => {
                    const next = new Set<number>();
                    prev.forEach(id => {
                        if (visibleCaseIds.has(id)) next.add(id);
                    });
                    return next;
                });
            }
        } catch (error) {
            console.error("Failed to fetch cases for run type:", error);
        } finally {
            setIsLoadingData(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || selectedCaseIds.size === 0) return;

        setIsSubmitting(true);
        try {
            const response = await api.post('/runs/', {
                title: title.trim(),
                run_type: runType,
                description: '',
                project_id: projectId,
                folder_id: folderId === '' ? null : Number(folderId),
                assignee_ids: assigneeIds,
                status: 'Active',
                case_ids: Array.from(selectedCaseIds)
            });
            onCreated(response.data.id);
            onClose();
        } catch (error) {
            console.error("Failed to create run:", error);
            alert("Failed to create test run.");
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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-900">Start New Test Run</h2>
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
                        className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col p-6">
                    <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Run Title <span className="text-rose-500">*</span></label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g., Release v1.6 Verification"
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                                autoFocus
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
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Folder (Optional)</label>
                            <select
                                value={folderId}
                                onChange={(e) => setFolderId(e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all bg-white"
                            >
                                <option value="">None (Top Level)</option>
                                {folders.map(f => (
                                    <option key={f.id} value={f.id}>{f.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-slate-700 mb-2">Assign To</label>
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
                                            <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col min-h-0 border border-slate-200 rounded-lg overflow-hidden bg-white">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between z-10">
                            <h3 className="font-semibold text-slate-800 text-sm">Select Test Cases</h3>
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-primary-700 bg-primary-50 px-2 py-0.5 rounded">
                                    {selectedCaseIds.size} / {cases.length} selected
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setSelectedCaseIds(new Set(cases.map(c => c.id)))}
                                    className="text-xs font-medium text-slate-500 hover:text-primary-600 px-2 py-1 rounded hover:bg-primary-50 transition-colors"
                                >
                                    全選
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedCaseIds(new Set())}
                                    className="text-xs font-medium text-slate-500 hover:text-rose-600 px-2 py-1 rounded hover:bg-rose-50 transition-colors"
                                >
                                    全不選
                                </button>
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
                                        <option value="Highest">Highest</option>
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
                        onClick={handleCreate}
                        disabled={isSubmitting || !title.trim() || selectedCaseIds.size === 0}
                        className="btn-primary"
                    >
                        {isSubmitting ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                        ) : (
                            'Create Test Run'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
