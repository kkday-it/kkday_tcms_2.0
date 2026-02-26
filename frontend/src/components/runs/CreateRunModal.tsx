import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Search, Folder, ChevronRight, ChevronDown } from 'lucide-react';
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
    onCreated: (runId: number) => void;
}

export default function CreateRunModal({ isOpen, onClose, projectId, initialTitle, initialCaseIds, initialFolderId, onCreated }: CreateRunModalProps) {
    const [title, setTitle] = useState('');
    const [runType, setRunType] = useState('Feature Test');
    const [folderId, setFolderId] = useState<number | ''>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [suites, setSuites] = useState<TestSuite[]>([]);
    const [cases, setCases] = useState<TestCase[]>([]);
    const [folders, setFolders] = useState<TestRunFolder[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(false);

    // UI state
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedSuites, setExpandedSuites] = useState<Set<number>>(new Set());
    const [selectedCaseIds, setSelectedCaseIds] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (isOpen) {
            setTitle(initialTitle || '');
            setFolderId(initialFolderId || '');
            fetchData();
        } else {
            // Reset state when closed
            setTitle('');
            setRunType('Feature Test');
            setFolderId('');
            setSelectedCaseIds(new Set());
            setSearchQuery('');
            setExpandedSuites(new Set());
        }
    }, [isOpen, initialTitle, initialCaseIds, initialFolderId]);

    const fetchData = async () => {
        setIsLoadingData(true);
        try {
            const [suitesRes, casesRes, foldersRes] = await Promise.all([
                api.get(`/suites/project/${projectId}`),
                api.get(`/cases/project/${projectId}`),
                api.get(`/run-folders/project/${projectId}`)
            ]);

            const fetchedSuites = suitesRes.data;
            setSuites(fetchedSuites);
            setCases(casesRes.data);
            setFolders(foldersRes.data);

            if (initialCaseIds) {
                // If duplicating, only select the previously attached cases
                setSelectedCaseIds(new Set(initialCaseIds));
            } else {
                // By default, select all cases
                setSelectedCaseIds(new Set(casesRes.data.map((c: any) => c.id)));
            }

            // By default, expand all root suites
            const rootSuiteIds = fetchedSuites.filter((s: TestSuite) => s.parent_suite_id === null).map((s: TestSuite) => s.id);
            setExpandedSuites(new Set(rootSuiteIds));
        } catch (error) {
            console.error("Failed to fetch suites or cases:", error);
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

    // --- Tree Logic ---

    // Filter cases by search query
    const filteredCases = useMemo(() => {
        if (!searchQuery) return cases;
        const lowerQ = searchQuery.toLowerCase();
        return cases.filter(c => c.title.toLowerCase().includes(lowerQ) || c.id.toString().includes(lowerQ));
    }, [cases, searchQuery]);

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

        // Hide suite if searching and it has no matching elements recursively
        const hasMatchingContent = () => {
            if (!searchQuery) return true;
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

        const isExpanded = expandedSuites.has(suite.id) || !!searchQuery;
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
            <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl flex flex-col max-h-[90vh]">
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

                    <div className="flex-1 flex flex-col min-h-0 border border-slate-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                            <h3 className="font-semibold text-slate-800 text-sm">Select Test Cases</h3>
                            <div className="text-sm text-slate-500">
                                {selectedCaseIds.size} / {cases.length} cases selected
                            </div>
                        </div>

                        {isLoadingData ? (
                            <div className="flex-1 flex items-center justify-center">
                                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                            </div>
                        ) : (
                            <div className="flex-1 flex bg-white overflow-hidden">
                                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1">
                                    <div className="relative mb-4">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Search cases & folders..."
                                            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                        />
                                    </div>
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
