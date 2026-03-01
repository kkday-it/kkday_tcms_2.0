import { useState, useEffect, useRef } from 'react';
// import { useParams } from 'react-router-dom';
import { Plus, Search, Filter, Loader2, Upload, Download, RefreshCw, Trash2, FolderOpen, ChevronDown } from 'lucide-react';
import { DndContext, DragEndEvent, closestCenter, useDroppable, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import TestCaseEditor from '../components/cases/TestCaseEditor';
import TestCasePreviewPane from '../components/cases/TestCasePreviewPane';
import EditSuiteModal from '../components/suites/EditSuiteModal';
import SuiteNode from '../components/suites/SuiteNode';
import api from '../lib/api';

function RootDroppableArea({ children }: { children: React.ReactNode }) {
    const { setNodeRef, isOver } = useDroppable({
        id: 'root',
    });
    return (
        <div ref={setNodeRef} className={`px-3 flex-1 overflow-y-auto ${isOver ? 'bg-primary-50/30 ring-inset ring-2 ring-primary-200' : ''}`}>
            <div className="text-xs text-center p-2 text-slate-400 border border-dashed border-slate-200 rounded mb-2 bg-slate-50/50">Drop here for Top Level</div>
            {children}
        </div>
    );
}

interface TestSuite {
    id: number;
    name: string;
    description?: string;
    cases?: number;
    parent_suite_id?: number | null;
}

interface TestCase {
    id: number;
    title: string;
    status: string;
    priority: string;
    automation_status: string;
    external_id?: string;
    tags?: string;
    labels?: string;
    jira_keys?: string;
    default_owner_id?: number;
    type?: string;
    layer?: string;
}

export default function Repository() {
    // const { projectId } = useParams();
    const projectId = 1; // Hardcoded for now until project selection is implemented

    const [suites, setSuites] = useState<TestSuite[]>([]);
    const [cases, setCases] = useState<TestCase[]>([]);
    const [activeSuiteId, setActiveSuiteId] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const [sidebarWidth, setSidebarWidth] = useState(288);
    const isResizing = useRef(false);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing.current) return;
            setSidebarWidth(Math.max(200, Math.min(800, e.clientX)));
        };

        const handleMouseUp = () => {
            if (isResizing.current) {
                isResizing.current = false;
                document.body.style.cursor = 'default';
                document.body.style.userSelect = 'auto';
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    };

    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingCaseId, setEditingCaseId] = useState<number | null>(null);

    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewingCaseId, setPreviewingCaseId] = useState<number | null>(null);
    const [previewRefreshKey, setPreviewRefreshKey] = useState(0);

    // Users for batch owner
    const [users, setUsers] = useState<{ id: number; username: string }[]>([]);
    const [selectedCases, setSelectedCases] = useState<Set<number>>(new Set());
    const [batchOwnerId, setBatchOwnerId] = useState<string>('');

    useEffect(() => {
        api.get('/users/').then(r => setUsers(r.data)).catch(() => { });
    }, []);

    // Fetch Suites for Project
    const fetchSuites = async () => {
        try {
            const response = await api.get(`/suites/project/${projectId}`);
            setSuites(response.data);
            // Removed auto-selection logic to show empty state by default
        } catch (error) {
            console.error("Failed to fetch suites:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSuites();
    }, [projectId]);

    // Fetch Cases for active Suite
    const fetchCases = async () => {
        if (!activeSuiteId) return;
        try {
            const response = await api.get(`/cases/suite/${activeSuiteId}`);
            setCases(response.data);
        } catch (error) {
            console.error("Failed to fetch cases:", error);
        }
    };

    useEffect(() => {
        fetchCases();
    }, [activeSuiteId]);

    const [isAddingSuite, setIsAddingSuite] = useState(false);
    const [newSuiteName, setNewSuiteName] = useState('');

    const handleCreateSuite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSuiteName.trim()) return;

        try {
            await api.post('/suites/', {
                name: newSuiteName,
                project_id: projectId
            });
            setNewSuiteName('');
            setIsAddingSuite(false);
            fetchSuites(); // Refresh suites list
        } catch (error) {
            console.error("Failed to create suite:", error);
            alert("Failed to create suite");
        }
    };

    const handleDeleteCase = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation(); // Prevent opening the edit modal
        if (!window.confirm("Are you sure you want to delete this test case?")) return;

        try {
            await api.delete(`/cases/${id}`);
            handleSaved(); // Refresh both cases and suites count
        } catch (error) {
            console.error("Failed to delete case:", error);
            alert("Failed to delete case");
        }
    };

    const [selectedSuites, setSelectedSuites] = useState<number[]>([]);

    const toggleSuiteSelection = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        setSelectedSuites(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
    };

    const handleBatchDeleteSuites = async () => {
        if (!window.confirm(`Are you sure you want to delete ${selectedSuites.length} suites and all their test cases?`)) return;

        try {
            await Promise.all(selectedSuites.map(id => api.delete(`/suites/${id}`)));
            setSelectedSuites([]);
            if (activeSuiteId && selectedSuites.includes(activeSuiteId)) {
                setActiveSuiteId(null);
            }
            fetchSuites();
        } catch (error) {
            console.error("Failed to batch delete suites:", error);
            alert("Failed to delete some suites");
            fetchSuites();
        }
    };

    const handleDeleteSuite = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this suite? This will delete all its test cases.")) return;

        try {
            await api.delete(`/suites/${id}`);
            if (activeSuiteId === id) setActiveSuiteId(null);
            fetchSuites();
        } catch (error) {
            console.error("Failed to delete suite:", error);
            alert("Failed to delete suite");
        }
    };

    const [isEditSuiteModalOpen, setIsEditSuiteModalOpen] = useState(false);
    const [editingSuite, setEditingSuite] = useState<TestSuite | null>(null);

    const handleEditSuite = (e: React.MouseEvent, suite: TestSuite) => {
        e.stopPropagation();
        setEditingSuite(suite);
        setIsEditSuiteModalOpen(true);
    };

    const handleSaved = () => {
        fetchCases();
        fetchSuites();
        // Force the preview pane to re-fetch the latest case data after editing
        setPreviewRefreshKey(k => k + 1);
    };

    const handleCreateCase = () => {
        setEditingCaseId(null);
        setIsEditorOpen(true);
    };

    const handlePreviewCase = (id: number) => {
        setPreviewingCaseId(id);
        setIsPreviewOpen(true);
    };

    const handleEditFromPreview = (id: number) => {
        setEditingCaseId(id);
        setIsEditorOpen(true);
    };

    const toggleCase = (id: number) => {
        setSelectedCases(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAllCases = () => {
        setSelectedCases(selectedCases.size === filteredCases.length ? new Set() : new Set(filteredCases.map(c => c.id)));
    };

    const handleBatchAssignOwner = async () => {
        try {
            await Promise.all([...selectedCases].map(caseId =>
                api.put(`/cases/${caseId}`, { default_owner_id: batchOwnerId ? Number(batchOwnerId) : null })
            ));
            setSelectedCases(new Set());
            setBatchOwnerId('');
            fetchCases();
        } catch (err) {
            console.error("Batch assign failed", err);
            alert("Failed to batch assign owner");
        }
    };

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [isExportOpen, setIsExportOpen] = useState(false);
    const [isSyncingDify, setIsSyncingDify] = useState(false);

    const handleExport = async (format: 'csv' | 'json' | 'ai_json') => {
        setIsExportOpen(false);
        const params = new URLSearchParams({ project_id: String(projectId), format });
        if (activeSuiteId) params.append('suite_id', String(activeSuiteId));

        try {
            const response = await api.get(`/cases/export?${params}`, { responseType: 'blob' });
            const ext = format === 'ai_json' ? 'json' : format;
            const filename = format === 'ai_json' ? 'test_cases_ai.json' : `test_cases.${ext}`;
            const url = URL.createObjectURL(response.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed');
        }
    };

    const handleSyncDify = async () => {
        setIsSyncingDify(true);
        try {
            const params = new URLSearchParams({ project_id: String(projectId) });
            if (activeSuiteId) params.set('suite_id', String(activeSuiteId));
            const res = await api.post(`/cases/sync/dify?${params}`);
            const { stats } = res.data;
            alert(`Dify 同步完成\n✅ 新增：${stats.created}  🔄 更新：${stats.updated}  ❌ 失敗：${stats.failed}`);
        } catch (error: any) {
            const msg = error?.response?.data?.detail || 'Dify 同步失敗';
            alert(msg);
        } finally {
            setIsSyncingDify(false);
        }
    };

    const handleImportZephyr = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        setIsImporting(true);
        try {
            await api.post(`/cases/import/zephyr?project_id=${projectId}`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            handleSaved(); // Refresh suites and cases
            alert("Zephyr XML import successful!");
        } catch (error) {
            console.error("Failed to import Zephyr XML:", error);
            alert("Failed to import Zephyr XML");
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const activeSuite = suites.find(s => s.id === activeSuiteId);

    // Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [filterStatus, setFilterStatus] = useState('');
    const [filterPriority, setFilterPriority] = useState('');
    const [filterAutomation, setFilterAutomation] = useState('');
    const [filterTags, setFilterTags] = useState('');
    const [filterLabels, setFilterLabels] = useState('');
    const [filterAssignee, setFilterAssignee] = useState('');
    const [filterType, setFilterType] = useState('');
    const [filterLayer, setFilterLayer] = useState('');

    const clearFilters = () => {
        setFilterStatus('');
        setFilterPriority('');
        setFilterAutomation('');
        setFilterTags('');
        setFilterLabels('');
        setFilterAssignee('');
        setFilterType('');
        setFilterLayer('');
    };

    // Filter cases based on search query and filters
    const filteredCases = cases.filter(tc => {
        const matchesSearch = tc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (tc.external_id && tc.external_id.toLowerCase().includes(searchQuery.toLowerCase()));

        if (!matchesSearch) return false;

        if (filterStatus && tc.status !== filterStatus) return false;
        if (filterPriority && tc.priority !== filterPriority) return false;
        if (filterAutomation && tc.automation_status !== filterAutomation) return false;
        if (filterAssignee) {
            if (filterAssignee === 'unassigned' && tc.default_owner_id != null) return false;
            if (filterAssignee !== 'unassigned' && String(tc.default_owner_id) !== filterAssignee) return false;
        }
        if (filterTags) {
            const tcTags = tc.tags ? tc.tags.toLowerCase() : '';
            const searchTags = filterTags.toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
            if (searchTags.length > 0 && !searchTags.some(st => tcTags.includes(st))) return false;
        }
        if (filterLabels) {
            const tcLabels = tc.labels ? tc.labels.toLowerCase() : '';
            const searchLabels = filterLabels.toLowerCase().split(',').map(l => l.trim()).filter(Boolean);
            if (searchLabels.length > 0 && !searchLabels.some(sl => tcLabels.includes(sl))) return false;
        }
        if (filterType && tc.type !== filterType) return false;
        if (filterLayer && tc.layer !== filterLayer) return false;

        return true;
    });

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        })
    );

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            </div>
        )
    }

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;

        const draggedSuiteId = active.id as number;
        const targetSuiteId = over.id;

        if (draggedSuiteId === targetSuiteId) return;

        // Prevent dropping inside itself or its children
        let currentId: number | null = targetSuiteId === 'root' ? null : Number(targetSuiteId);
        let isInvalid = false;
        while (currentId) {
            if (currentId === draggedSuiteId) {
                isInvalid = true;
                break;
            }
            const parentId = suites.find(s => s.id === currentId)?.parent_suite_id;
            currentId = parentId || null;
        }

        if (isInvalid) {
            alert("Cannot move a folder into itself or its children.");
            return;
        }

        const newParentId = targetSuiteId === 'root' ? null : Number(targetSuiteId);
        const suiteToMove = suites.find(s => s.id === draggedSuiteId);
        if (!suiteToMove) return;

        // Optimistic UI update
        const previousSuites = [...suites];
        setSuites(prev => prev.map(s => s.id === draggedSuiteId ? { ...s, parent_suite_id: newParentId } : s));

        try {
            await api.put(`/suites/${draggedSuiteId}`, {
                name: suiteToMove.name,
                parent_suite_id: newParentId
            });
            fetchSuites();
        } catch (e) {
            console.error(e);
            alert("Failed to move suite.");
            setSuites(previousSuites); // Revert
        }
    };

    const renderSuite = (suite: TestSuite, level: number = 0) => {
        const children = suites.filter(s => s.parent_suite_id === suite.id);
        return (
            <SuiteNode
                key={suite.id}
                suite={suite}
                level={level}
                isActive={activeSuiteId === suite.id}
                isSelected={selectedSuites.includes(suite.id)}
                onSelect={(id) => setActiveSuiteId(id)}
                onToggleSelection={(e, id) => toggleSuiteSelection(e as any, id)}
                onEdit={handleEditSuite as any}
                onDelete={handleDeleteSuite as any}
                childrenNodes={children.length > 0 ? children.map(child => renderSuite(child, level + 1)) : undefined}
            />
        );
    };

    const rootSuites = suites.filter(s => !s.parent_suite_id);

    return (
        <div className="flex-1 flex h-full overflow-hidden">
            <TestCasePreviewPane
                isOpen={isPreviewOpen}
                onClose={() => setIsPreviewOpen(false)}
                caseId={previewingCaseId}
                onEditClick={handleEditFromPreview}
                refreshKey={previewRefreshKey}
            />

            <TestCaseEditor
                isOpen={isEditorOpen}
                onClose={() => setIsEditorOpen(false)}
                caseId={editingCaseId}
                suiteId={activeSuiteId}
                onSaved={handleSaved}
            />
            <EditSuiteModal
                isOpen={isEditSuiteModalOpen}
                onClose={() => setIsEditSuiteModalOpen(false)}
                suite={editingSuite}
                allSuites={suites}
                onSaved={fetchSuites}
            />
            {/* Suites Tree Sidebar */}
            <div
                className="bg-slate-50 border-r border-slate-200 h-full flex flex-col relative shrink-0"
                style={{ width: `${sidebarWidth}px` }}
            >
                {/* Drag Handle */}
                <div
                    className="absolute top-0 -right-1.5 w-3 h-full cursor-ew-resize hover:bg-primary-300 z-50 transition-colors"
                    onMouseDown={handleMouseDown}
                />
                <div className="px-5 py-4 flex items-center justify-between">
                    <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Project Suites</h2>
                    <button
                        onClick={() => setIsAddingSuite(true)}
                        className="text-slate-400 hover:text-primary-600 transition-colors p-1"
                        title="Add Suite"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>

                <DndContext onDragEnd={handleDragEnd} collisionDetection={closestCenter} sensors={sensors}>
                    <RootDroppableArea>
                        <div className="space-y-0.5">
                            {isAddingSuite && (
                                <form onSubmit={handleCreateSuite} className="px-2 py-1.5 mb-2">
                                    <input
                                        type="text"
                                        autoFocus
                                        placeholder="Suite name..."
                                        className="w-full text-sm px-2 py-1.5 border border-primary-500 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                                        value={newSuiteName}
                                        onChange={(e) => setNewSuiteName(e.target.value)}
                                        onBlur={() => {
                                            if (!newSuiteName.trim()) setIsAddingSuite(false);
                                        }}
                                    />
                                </form>
                            )}
                            {rootSuites.map(suite => renderSuite(suite, 0))}
                            {suites.length === 0 && !isAddingSuite && (
                                <div className="px-2 py-3 text-sm text-slate-500 italic">No suites found.</div>
                            )}
                        </div>
                    </RootDroppableArea>
                </DndContext>
                {/* Bulk Actions Footer */}
                {selectedSuites.length > 0 && (
                    <div className="p-3 border-t border-slate-200 bg-slate-100/50 flex flex-col gap-2">
                        <div className="text-xs font-medium text-slate-600 px-1">{selectedSuites.length} selected</div>
                        <button
                            onClick={handleBatchDeleteSuites}
                            className="w-full btn-secondary text-rose-600 border-rose-200 hover:bg-rose-50 flex items-center justify-center gap-2 text-sm py-1.5"
                        >
                            <Trash2 className="w-4 h-4" /> Delete Selected
                        </button>
                    </div>
                )}
            </div>

            {/* Cases List Main Area */}
            <div className="flex-1 flex flex-col h-full bg-slate-50 relative">
                {!activeSuiteId ? (
                    <div className="flex-1 flex flex-col items-center justify-center h-full text-slate-400">
                        <div className="w-16 h-16 mb-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
                            <FolderOpen className="w-8 h-8 text-slate-300" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mb-1">Select a folder</h3>
                        <p className="text-sm text-center max-w-sm">
                            Click on a folder in the sidebar to view or manage its test cases.
                        </p>
                        {/* Export All when no suite selected */}
                        <div className="relative mt-4">
                            <button
                                onClick={() => setIsExportOpen(prev => !prev)}
                                className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
                            >
                                <Download className="w-4 h-4" /> Export All Cases <ChevronDown className="w-3 h-3" />
                            </button>
                            {isExportOpen && (
                                <div className="absolute left-1/2 -translate-x-1/2 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                                    <button onClick={() => handleExport('csv')} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Export CSV</button>
                                    <button onClick={() => handleExport('json')} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Export JSON</button>
                                    <hr className="my-1 border-slate-100" />
                                    <button onClick={() => handleExport('ai_json')} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"><span>🤖</span> Export for AI</button>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col h-full bg-white relative">
                        {/* Header */}
                        <div className="px-8 py-5 border-b border-slate-200 flex items-center justify-between bg-white z-10">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">{activeSuite ? activeSuite.name : 'Unknown Suite'}</h2>
                                <p className="text-sm text-slate-500 mt-1">{filteredCases.length} test cases in this suite</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <input type="file" accept=".xml" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImportZephyr} />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isImporting}
                                    className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                                >
                                    {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                    {isImporting ? 'Importing...' : 'Import XML'}
                                </button>
                                {/* Export 下拉選單 */}
                                <div className="relative">
                                    <button
                                        onClick={() => setIsExportOpen(prev => !prev)}
                                        className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
                                    >
                                        <Download className="w-4 h-4" /> Export <ChevronDown className="w-3 h-3" />
                                    </button>
                                    {isExportOpen && (
                                        <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                                            <button onClick={() => handleExport('csv')} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Export CSV</button>
                                            <button onClick={() => handleExport('json')} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Export JSON</button>
                                            <hr className="my-1 border-slate-100" />
                                            <button onClick={() => handleExport('ai_json')} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"><span>🤖</span> Export for AI</button>
                                        </div>
                                    )}
                                </div>
                                {/* Sync to Dify */}
                                <button
                                    onClick={handleSyncDify}
                                    disabled={isSyncingDify}
                                    title="同步至 Dify Knowledge Base"
                                    className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                                >
                                    {isSyncingDify ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                    {isSyncingDify ? 'Syncing...' : 'Sync to Dify'}
                                </button>
                                <button
                                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                                    className={`flex items-center gap-2 shadow-sm ${isFilterOpen ? 'bg-primary-50 border-primary-200 text-primary-700 px-3 py-2 rounded-lg text-sm font-medium' : 'btn-secondary'}`}
                                >
                                    <Filter className="w-4 h-4" /> Filter
                                </button>
                                <button onClick={handleCreateCase} className="btn-primary flex items-center gap-2 shadow-sm">
                                    <Plus className="w-4 h-4" /> Create Case
                                </button>
                            </div>
                        </div>

                        {/* Search + Integrated Filter Bar */}
                        <div className="px-8 py-3 bg-white border-b border-slate-100 flex flex-col gap-3">
                            <div className="flex items-center gap-4">
                                <div className="relative flex-1 max-w-md">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Search test cases or Zephyr IDs..."
                                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                {isFilterOpen && (
                                    <div className="px-3 py-1 bg-primary-50 text-primary-700 text-xs font-bold rounded-full border border-primary-100 uppercase tracking-wider">
                                        Advanced Filters On
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Filter Panel */}
                        {isFilterOpen && (
                            <div className="px-8 py-4 bg-white border-b border-slate-200 shadow-inner grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 animate-in slide-in-from-top-2">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Status</label>
                                    <select
                                        value={filterStatus}
                                        onChange={(e) => setFilterStatus(e.target.value)}
                                        className="w-full text-sm rounded-md border-slate-200 py-1.5 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                                    >
                                        <option value="">All</option>
                                        <option value="Active">Active</option>
                                        <option value="Draft">Draft</option>
                                        <option value="Deprecated">Deprecated</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Layer</label>
                                    <select
                                        value={filterLayer}
                                        onChange={(e) => setFilterLayer(e.target.value)}
                                        className="w-full text-sm rounded-md border-slate-200 py-1.5 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                                    >
                                        <option value="">All</option>
                                        <option value="E2E">E2E</option>
                                        <option value="API">API</option>
                                        <option value="Unit">Unit</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Type</label>
                                    <select
                                        value={filterType}
                                        onChange={(e) => setFilterType(e.target.value)}
                                        className="w-full text-sm rounded-md border-slate-200 py-1.5 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                                    >
                                        <option value="">All</option>
                                        <option value="Functional">Functional</option>
                                        <option value="Scenario">Scenario</option>
                                        <option value="Smoke">Smoke</option>
                                        <option value="Regression">Regression</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Priority</label>
                                    <select
                                        value={filterPriority}
                                        onChange={(e) => setFilterPriority(e.target.value)}
                                        className="w-full text-sm rounded-md border-slate-200 py-1.5 shadow-sm focus:border-primary-500 focus:ring-primary-500"
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
                                        className="w-full text-sm rounded-md border-slate-200 py-1.5 shadow-sm focus:border-primary-500 focus:ring-primary-500"
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
                                        className="w-full text-sm rounded-md border-slate-200 py-1.5 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                                    >
                                        <option value="">All Users</option>
                                        <option value="unassigned">Unassigned</option>
                                        {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                                    </select>
                                </div>
                                <div className="md:col-span-2 lg:col-span-3">
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Tags</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. core, api"
                                        value={filterTags}
                                        onChange={(e) => setFilterTags(e.target.value)}
                                        className="w-full text-sm rounded-md border-slate-200 py-1.5 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                                    />
                                </div>
                                <div className="md:col-span-1 lg:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Labels</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. regression"
                                        value={filterLabels}
                                        onChange={(e) => setFilterLabels(e.target.value)}
                                        className="w-full text-sm rounded-md border-slate-200 py-1.5 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                                    />
                                </div>
                                <div className="flex items-end justify-end">
                                    <button
                                        onClick={clearFilters}
                                        className="h-9 px-4 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-all flex items-center justify-center gap-1"
                                    >
                                        Reset
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Batch action bar */}
                        {selectedCases.size > 0 && (
                            <div className="flex items-center gap-3 px-8 py-3 bg-primary-50 border-b border-primary-100">
                                <span className="text-sm font-semibold text-primary-700">{selectedCases.size} selected</span>
                                <div className="flex items-center gap-2 ml-auto">
                                    <span className="text-sm text-slate-600 font-medium">Set Owner:</span>
                                    <select
                                        value={batchOwnerId}
                                        onChange={e => setBatchOwnerId(e.target.value)}
                                        className="text-sm rounded-md border-slate-300 py-1.5 pl-2 pr-8 shadow-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                                    >
                                        <option value="">— Unassign —</option>
                                        {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                                    </select>
                                    <button
                                        onClick={handleBatchAssignOwner}
                                        className="px-4 py-1.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
                                    >
                                        Apply
                                    </button>
                                    <button
                                        onClick={() => setSelectedCases(new Set())}
                                        className="px-3 py-1.5 text-sm font-medium text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Table */}
                        <div className="flex-1 overflow-y-auto w-full">
                            {filteredCases.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                                    <p className="mb-4">No test cases found in this suite.</p>
                                    <button onClick={handleCreateCase} className="btn-primary flex items-center gap-2 shadow-sm">
                                        <Plus className="w-4 h-4" /> Create First Case
                                    </button>
                                </div>
                            ) : (
                                <table className="w-full text-left border-collapse min-w-max">
                                    <thead className="sticky top-0 bg-white z-10 before:content-[''] before:absolute before:bottom-0 before:left-0 before:right-0 before:h-px before:bg-slate-200">
                                        <tr className="text-xs text-slate-500 uppercase tracking-wider">
                                            <th className="py-3 px-4 w-10 border-b border-slate-200">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedCases.size === filteredCases.length && filteredCases.length > 0}
                                                    onChange={toggleAllCases}
                                                    className="size-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
                                                />
                                            </th>
                                            <th className="py-3 font-semibold px-4 border-b border-slate-200">Case Title</th>
                                            <th className="py-3 font-semibold px-4 w-32 border-b border-slate-200">Status</th>
                                            <th className="py-3 font-semibold px-4 w-32 border-b border-slate-200">Priority</th>
                                            <th className="py-3 font-semibold px-4 w-32 border-b border-slate-200">Automation</th>
                                            <th className="py-3 font-semibold px-8 w-24 text-right border-b border-slate-200">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredCases.map((tc) => (
                                            <tr
                                                key={tc.id}
                                                onClick={() => handlePreviewCase(tc.id)}
                                                className={`hover:bg-slate-50/80 cursor-pointer group transition-colors ${selectedCases.has(tc.id) ? 'bg-primary-50/40' : ''}`}
                                            >
                                                <td className="py-3.5 px-4 w-10" onClick={e => { e.stopPropagation(); toggleCase(tc.id); }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedCases.has(tc.id)}
                                                        onChange={() => toggleCase(tc.id)}
                                                        className="size-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
                                                    />
                                                </td>
                                                <td className="py-3.5 px-4 font-medium text-slate-900 group-hover:text-primary-600 transition-colors">
                                                    <div className="flex flex-col gap-1 w-full max-w-[400px]">
                                                        <span className="text-xs font-mono text-slate-400">TC-{tc.id} {tc.external_id && <span className="ml-1 px-1.5 py-0.5 bg-primary-50 text-primary-600 rounded whitespace-nowrap">{tc.external_id}</span>}</span>
                                                        <span className="text-sm font-semibold text-slate-900 truncate" title={tc.title}>{tc.title}</span>
                                                    </div>
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tc.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}>
                                                        {tc.status}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4 text-sm text-slate-600">{tc.priority}</td>
                                                <td className="py-3.5 px-4">
                                                    <span className={`text-xs px-2.5 py-1 rounded-full border ${tc.automation_status === 'Automated' ? 'border-primary-200 text-primary-700 bg-primary-50' : 'border-slate-200 text-slate-500 bg-white'}`}>
                                                        {tc.automation_status}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-8 text-right">
                                                    <button
                                                        onClick={(e) => handleDeleteCase(e, tc.id)}
                                                        className="text-slate-400 hover:text-rose-500 p-1.5 rounded-md hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all"
                                                        title="Delete Case"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
