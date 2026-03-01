import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, CheckCircle2, XCircle, SkipForward, Clock, Loader2, Trash2, Copy, Search, Plus, Folder as FolderIcon, Pencil, Ban, Download, ChevronDown } from 'lucide-react';
import { DndContext, DragEndEvent, closestCenter, useDroppable, useSensor, useSensors, PointerSensor, useDraggable } from '@dnd-kit/core';
import api from '../lib/api';
import CreateRunModal from '../components/runs/CreateRunModal';
import EditRunFolderModal from '../components/runs/EditRunFolderModal';
import EditRunModal from '../components/runs/EditRunModal';
import RunFolderNode from '../components/runs/RunFolderNode';

function RootDroppableArea({ children, className }: { children: React.ReactNode, className?: string }) {
    const { setNodeRef, isOver } = useDroppable({
        id: 'root',
    });
    return (
        <div ref={setNodeRef} className={`transition-colors ${className} ${isOver ? 'bg-primary-50/50' : ''}`}>
            {children}
        </div>
    );
}

function DraggableRunCard({ run, onClick, onEdit, onDuplicate, onDelete }: { run: TestRun, onClick: () => void, onEdit: (e: React.MouseEvent) => void, onDuplicate: (e: React.MouseEvent) => void, onDelete: (e: React.MouseEvent) => void }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `run-${run.id}`,
        data: { type: 'run', run }
    });

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 50 : 'auto',
        opacity: isDragging ? 0.8 : 1,
    } : undefined;

    const passed = run.passed || 0;
    const failed = run.failed || 0;
    const blocked = run.blocked || 0;
    const unt = run.untested || 0;
    const total = run.total || (passed + failed + blocked + unt);

    // Use float for CSS width to avoid rounding gaps
    const passPct = total > 0 ? (passed / total) * 100 : 0;
    const failPct = total > 0 ? (failed / total) * 100 : 0;
    const blockedPct = total > 0 ? (blocked / total) * 100 : 0;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`bg-white border ${isDragging ? 'border-primary-400 shadow-md transform scale-[1.02]' : 'border-slate-200 shadow-sm hover:shadow-md'} rounded-xl p-6 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-6 relative`}
            onClick={(e) => {
                if (isDragging) return;
                onClick();
            }}
        >
            {/* Drag Handle Area (Invisible overlay to allow dragging from anywhere except buttons) */}
            <div
                className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing"
                {...attributes}
                {...listeners}
                onClick={(e) => {
                    e.stopPropagation();
                    if (!isDragging) {
                        onClick();
                    }
                }}
            ></div>

            <div className="flex-1 relative z-10 pointer-events-none">
                <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold text-slate-900">{run.title}</h3>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium border bg-primary-50 text-primary-700 border-primary-200">
                        {run.run_type || 'Feature Test'}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${run.status === 'Active' ? 'bg-primary-50 text-primary-700 border-primary-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {run.status}
                    </span>
                </div>

                <div className="flex items-center gap-4 text-sm text-slate-500">
                    <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> {new Date(run.created_at).toLocaleDateString()}</span>
                    <span>{total} cases</span>
                    {run.assignees && run.assignees.length > 0 && (
                        <div className="flex items-center flex-wrap gap-1.5">
                            {run.assignees.slice(0, 4).map(a => (
                                <span
                                    key={a.id}
                                    className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-full text-xs text-slate-700 font-medium"
                                >
                                    <span className="w-4 h-4 rounded-full bg-primary-200 text-primary-800 flex items-center justify-center text-[9px] font-bold shrink-0">
                                        {(a.full_name || a.username).charAt(0).toUpperCase()}
                                    </span>
                                    {a.username}
                                </span>
                            ))}
                            {run.assignees.length > 4 && (
                                <span className="text-xs text-slate-400 font-medium">+{run.assignees.length - 4}</span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Progress Indicators and Actions */}
            <div className="w-full md:w-auto flex flex-col md:flex-row items-start md:items-center gap-6 relative z-10">
                <div className="w-full md:w-64 pointer-events-none">
                    <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                        <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {passed}</span>
                        <span className="text-red-500 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> {failed}</span>
                        <span className="text-amber-500 flex items-center gap-1"><Ban className="w-3.5 h-3.5" /> {blocked}</span>
                        <span className="text-slate-400 flex items-center gap-1"><SkipForward className="w-3.5 h-3.5" /> {unt}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex shadow-inner border border-slate-200/30">
                        <div style={{ width: `${passPct}%` }} className="bg-emerald-500 h-full transition-all duration-500 ease-out"></div>
                        <div style={{ width: `${failPct}%` }} className="bg-rose-500 h-full transition-all duration-500 ease-out border-l border-white/10"></div>
                        <div style={{ width: `${blockedPct}%` }} className="bg-amber-400 h-full transition-all duration-500 ease-out border-l border-white/10"></div>
                        <div style={{ width: `${(100 - passPct - failPct - blockedPct)}%` }} className="bg-slate-200 h-full transition-all duration-500 ease-out border-l border-white/10"></div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={onEdit}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors group relative"
                        title="Edit Run"
                    >
                        <Pencil className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onDuplicate}
                        className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors group relative"
                        title="Duplicate Run"
                    >
                        <Copy className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onDelete}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors group relative"
                        title="Delete Run"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

interface TestRun {
    id: number;
    project_id: number;
    title: string;
    description?: string;
    status: string;
    run_type?: string;
    created_at: string;
    passed?: number;
    failed?: number;
    blocked?: number;
    untested?: number;
    total?: number;
    unt?: number; // Keep for backward compat during mapping
    folder_id?: number | null;
    assignees?: { id: number; username: string; full_name?: string }[];
}

interface TestRunFolder {
    id: number;
    name: string;
    parent_id?: number | null;
}

export default function TestRuns() {
    const projectId = 1; // Hardcoded for now
    const navigate = useNavigate();

    // Test Runs state
    const [runs, setRuns] = useState<TestRun[]>([]);
    const [isLoadingRuns, setIsLoadingRuns] = useState(true);

    // Folders state
    const [folders, setFolders] = useState<TestRunFolder[]>([]);
    const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
    const [isLoadingFolders, setIsLoadingFolders] = useState(true);

    // Modal state
    const [isCreatingRun, setIsCreatingRun] = useState(false);
    const [editingRun, setEditingRun] = useState<TestRun | null>(null);
    const [duplicateData, setDuplicateData] = useState<{ title: string, caseIds: number[] } | null>(null);

    const [isAddingFolder, setIsAddingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderParentId, setNewFolderParentId] = useState<number | null>(null);
    const [isEditFolderModalOpen, setIsEditFolderModalOpen] = useState(false);
    const [editingFolder, setEditingFolder] = useState<TestRunFolder | null>(null);

    // Initialize DndKit sensors to ignore small clicks
    const sensors = useSensors(useSensor(PointerSensor, {
        activationConstraint: { distance: 5 }
    }));

    // Sidebar resize state
    const [sidebarWidth, setSidebarWidth] = useState(256);
    const sidebarRef = useRef<HTMLDivElement>(null);
    const isResizing = useRef(false);

    const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
        isResizing.current = true;

        const startX = mouseDownEvent.clientX;
        const startWidth = sidebarWidth;

        const doDrag = (mouseMoveEvent: MouseEvent) => {
            if (isResizing.current) {
                const newWidth = startWidth + mouseMoveEvent.clientX - startX;
                if (newWidth >= 200 && newWidth <= 600) {
                    setSidebarWidth(newWidth);
                }
            }
        };

        const stopDrag = () => {
            isResizing.current = false;
            document.removeEventListener('mousemove', doDrag);
            document.removeEventListener('mouseup', stopDrag);
            // Re-enable text selection
            document.body.style.userSelect = 'auto';
        };

        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);

        // Disable text selection while dragging
        document.body.style.userSelect = 'none';
    }, [sidebarWidth]);

    // Data fetching
    const fetchFolders = async () => {
        setIsLoadingFolders(true);
        try {
            const response = await api.get(`/run-folders/project/${projectId}`);
            setFolders(response.data);
            if (response.data.length > 0 && activeFolderId === null) {
                // Optionally auto-select the first folder
                // setActiveFolderId(response.data[0].id);
            }
        } catch (error) {
            console.error("Failed to fetch folders:", error);
        } finally {
            setIsLoadingFolders(false);
        }
    };

    const fetchRuns = async () => {
        setIsLoadingRuns(true);
        try {
            const response = await api.get(`/runs/project/${projectId}`);
            let mappedRuns = response.data.map((r: any) => ({
                ...r,
                passed: r.passed ?? 0,
                failed: r.failed ?? 0,
                blocked: r.blocked ?? 0,
                untested: r.untested ?? 0,
                total: r.total ?? 0
            }));

            // Filter by selected folder if any
            if (activeFolderId !== null) {
                mappedRuns = mappedRuns.filter((r: TestRun) => r.folder_id === activeFolderId);
            }

            setRuns(mappedRuns);
        } catch (error) {
            console.error("Failed to fetch runs:", error);
        } finally {
            setIsLoadingRuns(false);
        }
    };

    useEffect(() => {
        fetchFolders();
    }, [projectId]);

    useEffect(() => {
        fetchRuns();
    }, [projectId, activeFolderId]);

    // Export
    const [isExportOpen, setIsExportOpen] = useState(false);
    const handleExportRuns = async (format: 'csv' | 'json') => {
        setIsExportOpen(false);
        try {
            const params = new URLSearchParams({ project_id: String(projectId), format });
            const response = await api.get(`/runs/export?${params}`, { responseType: 'blob' });
            const url = URL.createObjectURL(response.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `test_runs.${format}`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed');
        }
    };

    // Folder Actions
    const handleCreateFolder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFolderName.trim()) return;

        try {
            await api.post('/run-folders/', {
                name: newFolderName.trim(),
                project_id: projectId,
                parent_id: newFolderParentId
            });
            setNewFolderName('');
            setIsAddingFolder(false);
            fetchFolders();
        } catch (error) {
            console.error("Failed to create folder:", error);
            alert("Failed to create folder");
        }
    };

    const handleEditFolder = (folder: TestRunFolder) => {
        setEditingFolder(folder);
        setIsEditFolderModalOpen(true);
    };

    const handleDeleteFolder = async (folderId: number) => {
        if (!confirm("Are you sure you want to delete this folder? All child folders will NOT be deleted automatically (may cause issues), and runs won't be deleted.")) return;
        try {
            await api.delete(`/run-folders/${folderId}`);
            if (activeFolderId === folderId) setActiveFolderId(null);
            fetchFolders();
        } catch (error) {
            console.error("Failed to delete folder:", error);
            alert("Failed to delete folder");
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;

        const activeIdStr = active.id.toString();
        const overIdStr = over.id.toString();

        if (activeIdStr === overIdStr) return;

        const targetIdStr = overIdStr.replace('folder-', '');
        const targetId = overIdStr === 'root' ? null : parseInt(targetIdStr);

        try {
            if (activeIdStr.startsWith('run-')) {
                // Handle moving a test run
                const runIdStr = activeIdStr.replace('run-', '');
                const runId = parseInt(runIdStr);

                await api.put(`/runs/${runId}`, {
                    folder_id: targetId
                });
                fetchRuns();
            } else if (activeIdStr.startsWith('folder-')) {
                // Handle moving a folder
                const folderIdStr = activeIdStr.replace('folder-', '');
                const folderId = parseInt(folderIdStr);

                await api.put(`/run-folders/${folderId}`, {
                    parent_id: targetId
                });
                fetchFolders();
            }
        } catch (error) {
            console.error("Failed to move item:", error);
            alert("Failed to move item");
        }
    };

    // Run actions
    const handleDeleteRun = async (e: React.MouseEvent, runId: number) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this test run? This will also delete all associated execution results.")) return;

        try {
            await api.delete(`/runs/${runId}`);
            fetchRuns();
        } catch (error) {
            console.error("Failed to delete run:", error);
            alert("Failed to delete run.");
        }
    };

    const handleDuplicateRun = async (e: React.MouseEvent, runId: number, runTitle: string) => {
        e.stopPropagation();
        try {
            const resultsResponse = await api.get(`/results/run/${runId}`);
            const caseIds = resultsResponse.data.map((r: any) => r.case_id);
            setDuplicateData({ title: `${runTitle} (Copy)`, caseIds });
            setIsCreatingRun(true);
        } catch (error) {
            console.error("Failed to duplicate run:", error);
            alert("Failed to fetch run details for duplication.");
        }
    };

    // Tree Rendering
    const renderFolderTree = (parentId: number | null, level = 0) => {
        const children = folders.filter(f => f.parent_id === parentId);

        return (
            <div className="space-y-0.5">
                {children.map(folder => (
                    <RunFolderNode
                        key={folder.id}
                        folder={folder}
                        level={level}
                        isActive={activeFolderId === folder.id}
                        onSelect={(id) => setActiveFolderId(id)}
                        onAddSubFolder={(id) => { setIsAddingFolder(true); setNewFolderParentId(id); setNewFolderName(''); }}
                        onEdit={handleEditFolder}
                        onDelete={handleDeleteFolder}
                        childrenNodes={renderFolderTree(folder.id, level + 1)}
                    />
                ))}

                {isAddingFolder && newFolderParentId === parentId && (
                    <div className="mt-1 mb-2" style={{ paddingLeft: level === 0 ? '8px' : `${level * 16 + 8}px`, paddingRight: '8px' }}>
                        <form onSubmit={handleCreateFolder} className="bg-white rounded border border-primary-200 shadow-sm overflow-hidden">
                            <input
                                autoFocus
                                type="text"
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                placeholder="Folder name..."
                                className="w-full px-2 py-1.5 text-sm outline-none"
                                onBlur={() => {
                                    if (!newFolderName.trim()) setIsAddingFolder(false);
                                }}
                            />
                            <div className="flex bg-slate-50 px-2 py-1 gap-1 border-t border-slate-100">
                                <button
                                    type="submit"
                                    disabled={!newFolderName.trim()}
                                    className="flex-1 text-xs font-medium text-primary-600 hover:bg-primary-50 rounded py-1 transition-colors disabled:opacity-50"
                                >
                                    Save
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setIsAddingFolder(false); setNewFolderName(''); }}
                                    className="flex-1 text-xs font-medium text-slate-500 hover:bg-slate-200 rounded py-1 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </div>
        );
    };

    const isLoading = isLoadingRuns || isLoadingFolders;

    return (
        <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <div className="flex-1 flex overflow-hidden">
                    {/* Sidebar */}
                    <div
                        ref={sidebarRef}
                        style={{ width: `${sidebarWidth}px`, minWidth: '200px', maxWidth: '600px' }}
                        className="bg-slate-50 border-r border-slate-200 flex flex-col h-full shrink-0 relative"
                    >
                        {/* Resizer Handle */}
                        <div
                            onMouseDown={startResizing}
                            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary-300 active:bg-primary-500 z-10 opacity-0 hover:opacity-100 transition-opacity translate-x-1/2"
                        ></div>

                        <div className="p-4 border-b border-slate-200 flex-shrink-0">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-sm font-bold tracking-wider text-slate-500 uppercase">Folders</h2>
                                <button
                                    onClick={() => setIsAddingFolder(true)}
                                    className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded transition-colors"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="relative">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Search folders..."
                                    className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 transition-all placeholder:text-slate-400"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto py-2">
                            <RootDroppableArea className={`w-full flex items-center justify-between px-4 py-2 text-sm transition-colors cursor-pointer group hover:bg-slate-100 ${activeFolderId === null ? 'bg-primary-50 text-primary-700 font-medium' : 'text-slate-700'}`} >
                                <div
                                    className="flex items-center gap-2 flex-1 relative z-10"
                                    onClick={() => setActiveFolderId(null)}
                                >
                                    <FolderIcon className={`w-4 h-4 ${activeFolderId === null ? 'text-primary-500' : 'text-slate-400'}`} />
                                    <span className={activeFolderId === null ? 'text-primary-700 font-medium' : 'text-slate-700'}>All Runs</span>
                                </div>
                                <span className="text-xs text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200 relative z-10">
                                    {runs.length}
                                </span>
                            </RootDroppableArea>

                            <div className="mt-2 px-2">
                                {renderFolderTree(null)}
                            </div>
                        </div>
                    </div>

                    {/* Main Content Pane */}
                    <div className="flex-1 flex flex-col h-full bg-slate-50 relative overflow-hidden">
                        <div className="flex-1 p-8 overflow-y-auto">
                            <div className="flex items-center justify-between mb-8">
                                <h1 className="text-2xl font-bold text-slate-900">
                                    {activeFolderId ? folders.find(f => f.id === activeFolderId)?.name || 'Folder Runs' : 'All Test Runs'}
                                </h1>
                                <div className="flex items-center gap-2">
                                    {/* Export Dropdown */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setIsExportOpen(prev => !prev)}
                                            className="btn-secondary flex items-center gap-1.5"
                                        >
                                            <Download className="w-4 h-4" /> Export <ChevronDown className="w-3 h-3" />
                                        </button>
                                        {isExportOpen && (
                                            <div className="absolute right-0 mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                                                <button onClick={() => handleExportRuns('csv')} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50">CSV</button>
                                                <button onClick={() => handleExportRuns('json')} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50">JSON</button>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => { setDuplicateData(null); setIsCreatingRun(true); }}
                                        className="btn-primary flex items-center gap-2"
                                    >
                                        <Play className="w-4 h-4" fill="currentColor" /> Start New Run
                                    </button>
                                </div>
                            </div>

                            {/* Create Run Modal */}
                            <CreateRunModal
                                isOpen={isCreatingRun}
                                onClose={() => setIsCreatingRun(false)}
                                projectId={projectId}
                                initialTitle={duplicateData?.title}
                                initialCaseIds={duplicateData?.caseIds}
                                initialFolderId={activeFolderId !== null ? activeFolderId : undefined}
                                onCreated={(runId) => {
                                    fetchRuns();
                                    navigate(`/runs/${runId}`);
                                }}
                            />

                            {runs.length === 0 && !isLoading ? (
                                <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 border-dashed text-slate-500">
                                    <Play className="w-12 h-12 text-slate-300 mb-4" />
                                    <p className="mb-2 text-lg font-medium text-slate-900">No active test runs</p>
                                    <p className="mb-6 text-sm">Start a test run to execute cases and track results.</p>
                                    <button
                                        onClick={() => { setDuplicateData(null); setIsCreatingRun(true); }}
                                        className="btn-primary flex items-center gap-2"
                                    >
                                        <Play className="w-4 h-4" fill="currentColor" /> Start New Run
                                    </button>
                                </div>
                            ) : isLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4">
                                    {runs.map(run => (
                                        <DraggableRunCard
                                            key={`run-${run.id}`}
                                            run={run}
                                            onClick={() => navigate(`/runs/${run.id}`)}
                                            onEdit={(e) => { e.stopPropagation(); setEditingRun(run); }}
                                            onDuplicate={(e) => handleDuplicateRun(e, run.id, run.title)}
                                            onDelete={(e) => handleDeleteRun(e, run.id)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </DndContext>

            {/* Modals outside of split panes */}
            <EditRunFolderModal
                isOpen={isEditFolderModalOpen}
                onClose={() => setIsEditFolderModalOpen(false)}
                folder={editingFolder}
                allFolders={folders}
                onSaved={fetchFolders}
            />

            <EditRunModal
                isOpen={!!editingRun}
                run={editingRun}
                folders={folders}
                onClose={() => setEditingRun(null)}
                onUpdated={fetchRuns}
            />
        </>
    );
}
