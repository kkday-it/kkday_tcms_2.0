import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Search, Folder, ChevronRight, ChevronDown } from 'lucide-react';
import api from '../../lib/api';
import { useUsers } from '../../lib/useUsers';
import { UserMultiSelect } from '../common/UserSelect';

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
            clearFilters();
            fetchData('Feature Test');
        } else {
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

            await fetchCasesForRunType(initialRunType, true);
            setExpandedSuites(new Set());
        } catch (error) {
            console.error("Failed to fetch layout data:", error);
        } finally {
            setIsLoadingData(false);
        }
    };

    const fetchCasesForRunType = async (type: string, isInitialLoad: boolean = false) => {
        setIsLoadingData(true);
        try {
            let queryStr = "";
            if (type === 'Feature Test') {
                queryStr = "?exclude_tags=Regression&exclude_labels=Regression";
            }

            const casesRes = await api.get(`/cases/project/${projectId}${queryStr}`);
            const fetchedCases = casesRes.data;
            setCases(fetchedCases);

            if (isInitialLoad) {
                if (initialCaseIds) {
                    setSelectedCaseIds(new Set(initialCaseIds));
                } else {
                    setSelectedCaseIds(new Set());
                }
            } else {
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

    const filteredCases = useMemo(() => {
        return cases.filter(c => {
            if (searchQuery) {
                const lowerQ = searchQuery.toLowerCase();
                const textMatch = c.title.toLowerCase().includes(lowerQ) || c.id.toString().includes(lowerQ);
                if (!textMatch) return false;
            }
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

    const hasActiveFilters = filterStatus || filterPriority || filterAutomation || filterAssignee || filterTags || filterLabels;

    const toggleSuiteExpanded = (e: React.MouseEvent, suiteId: number) => {
        e.stopPropagation();
        setExpandedSuites(prev => {
            const next = new Set(prev);
            if (next.has(suiteId)) next.delete(suiteId);
            else next.add(suiteId);
            return next;
        });
    };

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
                        {selectedCasesInSuiteCount}/{allCasesInSuite.length}
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
            <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-900">建立測試執行</h2>
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
                        className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col p-6">
                    {/* Top form fields */}
                    <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">執行標題 <span className="text-rose-500">*</span></label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="例：v1.6 版本驗證"
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">執行類型</label>
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
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">資料夾（選填）</label>
                            <select
                                value={folderId}
                                onChange={(e) => setFolderId(e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all bg-white"
                            >
                                <option value="">無（最上層）</option>
                                {folders.map(f => (
                                    <option key={f.id} value={f.id}>{f.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Assignee */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-slate-700 mb-2">指派給</label>
                        <UserMultiSelect
                            users={users}
                            value={assigneeIds}
                            onChange={setAssigneeIds}
                            ariaLabel="指派人員"
                        />
                    </div>

                    {/* Case selection section - Left/Right layout */}
                    <div className="flex-1 min-h-0 border border-slate-200 rounded-lg overflow-hidden bg-white flex">
                        {/* Left panel: Filters */}
                        <div className="w-56 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col overflow-y-auto">
                            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-slate-700">篩選條件</h3>
                                {hasActiveFilters && (
                                    <button
                                        type="button"
                                        onClick={clearFilters}
                                        className="text-xs text-primary-600 hover:text-primary-800 font-medium"
                                    >
                                        清除
                                    </button>
                                )}
                            </div>
                            <div className="p-3 space-y-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">狀態</label>
                                    <select
                                        value={filterStatus}
                                        onChange={(e) => setFilterStatus(e.target.value)}
                                        className="w-full text-xs rounded border-slate-300 py-1"
                                    >
                                        <option value="">全部</option>
                                        <option value="Active">Active</option>
                                        <option value="Draft">Draft</option>
                                        <option value="Deprecated">Deprecated</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">優先級</label>
                                    <select
                                        value={filterPriority}
                                        onChange={(e) => setFilterPriority(e.target.value)}
                                        className="w-full text-xs rounded border-slate-300 py-1"
                                    >
                                        <option value="">全部</option>
                                        <option value="Highest">Highest</option>
                                        <option value="Critical">Critical</option>
                                        <option value="High">High</option>
                                        <option value="Medium">Medium</option>
                                        <option value="Low">Low</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">自動化</label>
                                    <select
                                        value={filterAutomation}
                                        onChange={(e) => setFilterAutomation(e.target.value)}
                                        className="w-full text-xs rounded border-slate-300 py-1"
                                    >
                                        <option value="">全部</option>
                                        <option value="Automated">Automated</option>
                                        <option value="Manual">Manual</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">指派人員</label>
                                    <select
                                        value={filterAssignee}
                                        onChange={(e) => setFilterAssignee(e.target.value)}
                                        className="w-full text-xs rounded border-slate-300 py-1"
                                    >
                                        <option value="">全部</option>
                                        <option value="unassigned">未指派</option>
                                        {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">標籤</label>
                                    <input
                                        type="text"
                                        placeholder="逗號分隔..."
                                        value={filterTags}
                                        onChange={(e) => setFilterTags(e.target.value)}
                                        className="w-full text-xs rounded border-slate-300 py-1 px-2"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">標記</label>
                                    <input
                                        type="text"
                                        placeholder="逗號分隔..."
                                        value={filterLabels}
                                        onChange={(e) => setFilterLabels(e.target.value)}
                                        className="w-full text-xs rounded border-slate-300 py-1 px-2"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Right panel: Case tree */}
                        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                            {/* Header */}
                            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                                <h3 className="font-semibold text-slate-800 text-sm">選擇測試案例</h3>
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-primary-700 bg-primary-50 px-2 py-0.5 rounded">
                                        {selectedCaseIds.size} / {cases.length} 已選
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
                                </div>
                            </div>

                            {isLoadingData ? (
                                <div className="flex-1 flex items-center justify-center bg-white">
                                    <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col bg-white overflow-hidden">
                                    <div className="px-4 pt-3 pb-2">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <input
                                                type="text"
                                                placeholder="搜尋案例標題或 ID..."
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
                                                找不到符合篩選條件的案例
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 rounded-b-xl">
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
                        className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 transition-colors"
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        onClick={handleCreate}
                        disabled={isSubmitting || !title.trim() || selectedCaseIds.size === 0}
                        className="btn-primary"
                    >
                        {isSubmitting ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> 建立中...</>
                        ) : (
                            '建立測試執行'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
