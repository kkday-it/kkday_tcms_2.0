import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Play, CheckCircle2, XCircle, SkipForward, Clock, Loader2, Trash2, Copy, Search, Plus, Folder as FolderIcon, Pencil, Ban, Download, ChevronDown, CalendarDays, Link2, Check, X } from 'lucide-react';
import { DndContext, DragEndEvent, closestCenter, useDroppable, useSensor, useSensors, PointerSensor, useDraggable } from '@dnd-kit/core';
import api from '../lib/api';
import { canWrite } from '../lib/permissions';
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
    const [copied, setCopied] = useState(false);
    const writable = canWrite();
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
            className={`bg-white border-b ${isDragging ? 'border-primary-400 shadow-md opacity-80' : 'border-slate-100 hover:bg-slate-50/60'} transition-all cursor-pointer flex items-center gap-4 px-4 py-3 relative group`}
            onClick={() => {
                if (isDragging) return;
                onClick();
            }}
        >
            {/* Drag Handle Area */}
            <div
                className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing"
                {...attributes}
                {...listeners}
                onClick={(e) => {
                    e.stopPropagation();
                    if (!isDragging) onClick();
                }}
            ></div>

            {/* Title + badges */}
            <div className="flex-1 min-w-0 relative z-10 pointer-events-none">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900 truncate">{run.title}</span>
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200 shrink-0">
                        {run.run_type || 'Feature Test'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border shrink-0 ${run.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {run.status}
                    </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(run.created_at).toLocaleDateString()}</span>
                    <span>{total} 個案例</span>
                    {run.assignees && run.assignees.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                            {run.assignees.slice(0, 3).map(a => (
                                <span key={a.id} className="px-1.5 py-0.5 rounded bg-primary-100 text-primary-800 text-[11px] font-medium leading-none">
                                    {a.full_name || a.username}
                                </span>
                            ))}
                            {run.assignees.length > 3 && <span className="text-slate-400">+{run.assignees.length - 3}</span>}
                        </div>
                    )}
                </div>
            </div>

            {/* Progress bar */}
            <div className="w-40 shrink-0 relative z-10 pointer-events-none">
                <div className="flex items-center justify-between text-xs font-medium mb-1">
                    <span className="text-emerald-600 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> {passed}</span>
                    <span className="text-rose-500 flex items-center gap-0.5"><XCircle className="w-3 h-3" /> {failed}</span>
                    <span className="text-amber-500 flex items-center gap-0.5"><Ban className="w-3 h-3" /> {blocked}</span>
                    <span className="text-slate-400 flex items-center gap-0.5"><SkipForward className="w-3 h-3" /> {unt}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                    <div style={{ width: `${passPct}%` }} className="bg-emerald-500 h-full transition-all"></div>
                    <div style={{ width: `${failPct}%` }} className="bg-rose-500 h-full transition-all"></div>
                    <div style={{ width: `${blockedPct}%` }} className="bg-amber-400 h-full transition-all"></div>
                    <div style={{ width: `${(100 - passPct - failPct - blockedPct)}%` }} className="bg-slate-200 h-full transition-all"></div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 relative z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={onEdit} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="編輯">
                    <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={onDuplicate} className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors" title="複製">
                    <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(`${window.location.origin}/runs/${run.id}`);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                    }}
                    className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                    title="複製連結"
                >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Link2 className="w-3.5 h-3.5" />}
                </button>
                {writable && (
                    <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="刪除">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}
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
    const [searchParams, setSearchParams] = useSearchParams();
    const writable = canWrite();

    // Test Runs state
    const [runs, setRuns] = useState<TestRun[]>([]);
    const [isLoadingRuns, setIsLoadingRuns] = useState(true);
    const [runSearchQuery, setRunSearchQuery] = useState('');

    // Folders state
    const [folders, setFolders] = useState<TestRunFolder[]>([]);
    const initialFolderId = searchParams.get('folder') ? Number(searchParams.get('folder')) : null;
    const [activeFolderId, setActiveFolderId] = useState<number | null>(initialFolderId);
    const [isLoadingFolders, setIsLoadingFolders] = useState(true);

    // Modal state
    const [isCreatingRun, setIsCreatingRun] = useState(false);
    const [editingRun, setEditingRun] = useState<TestRun | null>(null);
    const [duplicateData, setDuplicateData] = useState<{ title: string, caseIds: number[] } | null>(null);

    // Batch copy folder state
    const [copyFolderDateModal, setCopyFolderDateModal] = useState<{ folderId: number; hasTemplate: boolean } | null>(null);
    const [copyFolderDate, setCopyFolderDate] = useState('');
    const [isCopyingFolder, setIsCopyingFolder] = useState(false);

    const [isAddingFolder, setIsAddingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderParentId, setNewFolderParentId] = useState<number | null>(null);
    const [isEditFolderModalOpen, setIsEditFolderModalOpen] = useState(false);
    const [editingFolder, setEditingFolder] = useState<TestRunFolder | null>(null);

    // Share link copy feedback
    const [copiedFolderId, setCopiedFolderId] = useState<number | null>(null);

    const handleShareFolderLink = (id: number) => {
        const url = `${window.location.origin}${window.location.pathname}?folder=${id}`;
        navigator.clipboard.writeText(url).catch(console.warn);
        setCopiedFolderId(id);
        setTimeout(() => setCopiedFolderId(null), 1500);
    };

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

    /** 取得某資料夾及其所有子孫資料夾的 ID 集合 */
    const getDescendantFolderIds = useCallback((folderId: number, allFolders: TestRunFolder[]): Set<number> => {
        const ids = new Set<number>([folderId]);
        const queue = [folderId];
        while (queue.length > 0) {
            const current = queue.shift()!;
            allFolders.filter(f => f.parent_id === current).forEach(child => {
                ids.add(child.id);
                queue.push(child.id);
            });
        }
        return ids;
    }, []);

    const fetchRuns = async () => {
        setIsLoadingRuns(true);
        try {
            const response = await api.get(`/runs/project/${projectId}`);
            const mappedRuns = response.data.map((r: any) => ({
                ...r,
                passed: r.passed ?? 0,
                failed: r.failed ?? 0,
                blocked: r.blocked ?? 0,
                untested: r.untested ?? 0,
                total: r.total ?? 0
            }));
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
    }, [projectId]);

    /** 根據選取資料夾（含所有子孫）+ keyword 搜尋過濾要顯示的 runs。
     *  當 searchQuery 非空時忽略 folder 限制做全域搜尋，方便「忘記在哪個 folder」的情境。
     */
    const displayedRuns = useMemo(() => {
        const q = runSearchQuery.trim().toLowerCase();
        let scope: TestRun[];
        if (q) {
            scope = runs;
        } else if (activeFolderId === null) {
            scope = runs;
        } else {
            const folderIds = getDescendantFolderIds(activeFolderId, folders);
            scope = runs.filter(r => r.folder_id !== null && r.folder_id !== undefined && folderIds.has(r.folder_id as number));
        }
        if (!q) return scope;
        return scope.filter(r =>
            r.title.toLowerCase().includes(q) ||
            (r.description && r.description.toLowerCase().includes(q)) ||
            String(r.id).includes(q) ||
            (r.run_type && r.run_type.toLowerCase().includes(q)) ||
            (r.assignees && r.assignees.some(a =>
                (a.full_name && a.full_name.toLowerCase().includes(q)) ||
                a.username.toLowerCase().includes(q)
            ))
        );
    }, [runs, activeFolderId, folders, getDescendantFolderIds, runSearchQuery]);

    /** Pre-compute run count per folder (including descendants).
     *  Single pass over runs → O(R + F*D) instead of O(F*R). */
    const folderRunCountMap = useMemo(() => {
        // Step 1: direct folder_id → count in one pass
        const directCount = new Map<number, number>();
        for (const run of runs) {
            if (run.folder_id != null) {
                const fid = run.folder_id as number;
                directCount.set(fid, (directCount.get(fid) ?? 0) + 1);
            }
        }
        // Step 2: for each folder, sum over descendant IDs
        const map = new Map<number, number>();
        for (const folder of folders) {
            const ids = getDescendantFolderIds(folder.id, folders);
            let count = 0;
            for (const id of ids) {
                count += directCount.get(id) ?? 0;
            }
            map.set(folder.id, count);
        }
        return map;
    }, [folders, runs, getDescendantFolderIds]);

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
        // KQT-15346: backend cascade-deletes descendant folders + every Cycle inside them.
        if (!confirm("請問確定要刪除，底下所有也會一並清空")) return;
        try {
            await api.delete(`/run-folders/${folderId}`);
            if (activeFolderId === folderId) {
                setActiveFolderId(null);
                setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('folder'); return next; });
            }
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

    const handleCopyFolder = async (folderId: number) => {
        const folderIds = getDescendantFolderIds(folderId, folders);
        const folderRuns = runs.filter(r => r.folder_id !== null && r.folder_id !== undefined && folderIds.has(r.folder_id as number));
        if (folderRuns.length === 0) {
            alert('此資料夾內沒有測試執行可複製');
            return;
        }
        const hasTemplate = folderRuns.some(r => r.title.includes('$template'));
        setCopyFolderDate(new Date().toISOString().split('T')[0]);
        setCopyFolderDateModal({ folderId, hasTemplate });
    };

    const handleConfirmCopyFolder = async () => {
        if (!copyFolderDateModal) return;
        const { folderId } = copyFolderDateModal;
        const folderIds = getDescendantFolderIds(folderId, folders);
        const folderRuns = runs.filter(r => r.folder_id !== null && r.folder_id !== undefined && folderIds.has(r.folder_id as number));

        setIsCopyingFolder(true);
        try {
            // Single bulk-copy call: backend handles all DB work in one transaction
            await api.post('/runs/bulk-copy', {
                run_ids: folderRuns.map(r => r.id),
                date_string: copyFolderDate,
            });
            setCopyFolderDateModal(null);
            fetchRuns();
        } catch (error) {
            console.error("Failed to batch copy folder runs:", error);
            alert("批次複製失敗");
        } finally {
            setIsCopyingFolder(false);
        }
    };

    // Tree Rendering
    const renderFolderTree = (parentId: number | null, level = 0) => {
        const children = folders.filter(f => f.parent_id === parentId);

        return (
            <div className="space-y-0.5">
                {children.map(folder => {
                    const folderRunCount = folderRunCountMap.get(folder.id) ?? 0;
                    return (
                    <RunFolderNode
                        key={folder.id}
                        folder={folder}
                        level={level}
                        isActive={activeFolderId === folder.id}
                        onSelect={(id) => {
                            setActiveFolderId(id);
                            setSearchParams(prev => { const next = new URLSearchParams(prev); next.set('folder', String(id)); return next; });
                        }}
                        onAddSubFolder={(id) => { setIsAddingFolder(true); setNewFolderParentId(id); setNewFolderName(''); }}
                        onEdit={handleEditFolder}
                        onDelete={handleDeleteFolder}
                        onCopyFolder={handleCopyFolder}
                        onShareLink={handleShareFolderLink}
                        copiedFolderId={copiedFolderId}
                        runCount={folderRunCount}
                        childrenNodes={renderFolderTree(folder.id, level + 1)}
                    />
                    );
                })}

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
                                <h2 className="text-sm font-bold tracking-wider text-slate-500 uppercase">資料夾</h2>
                                {writable && (
                                    <button
                                        onClick={() => setIsAddingFolder(true)}
                                        className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded transition-colors"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            <div className="relative">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={runSearchQuery}
                                    onChange={(e) => setRunSearchQuery(e.target.value)}
                                    placeholder="搜尋 Run（標題、描述、ID、負責人）"
                                    className="w-full pl-9 pr-8 py-1.5 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 transition-all placeholder:text-slate-400"
                                />
                                {runSearchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setRunSearchQuery('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
                                        aria-label="清除搜尋"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto py-2">
                            <RootDroppableArea className={`w-full flex items-center justify-between px-4 py-2 text-sm transition-colors cursor-pointer group hover:bg-slate-100 ${activeFolderId === null ? 'bg-primary-50 text-primary-700 font-medium' : 'text-slate-700'}`} >
                                <div
                                    className="flex items-center gap-2 flex-1 relative z-10"
                                    onClick={() => { setActiveFolderId(null); setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('folder'); return next; }); }}
                                >
                                    <FolderIcon className={`w-4 h-4 ${activeFolderId === null ? 'text-primary-500' : 'text-slate-400'}`} />
                                    <span className={activeFolderId === null ? 'text-primary-700 font-medium' : 'text-slate-700'}>全部執行</span>
                                </div>
                                <span className="text-xs text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200 relative z-10">
                                    {displayedRuns.length}
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
                                    {activeFolderId ? folders.find(f => f.id === activeFolderId)?.name || '資料夾執行' : '全部測試執行'}
                                </h1>
                                <div className="flex items-center gap-2">
                                    {/* Export Dropdown */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setIsExportOpen(prev => !prev)}
                                            className="btn-secondary flex items-center gap-1.5"
                                        >
                                            <Download className="w-4 h-4" /> 匯出 <ChevronDown className="w-3 h-3" />
                                        </button>
                                        {isExportOpen && (
                                            <div className="absolute right-0 mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                                                <button onClick={() => handleExportRuns('csv')} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50">CSV</button>
                                                <button onClick={() => handleExportRuns('json')} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50">JSON</button>
                                            </div>
                                        )}
                                    </div>
                                    {writable && (
                                        <button
                                            onClick={() => { setDuplicateData(null); setIsCreatingRun(true); }}
                                            className="btn-primary flex items-center gap-2"
                                        >
                                            <Play className="w-4 h-4" fill="currentColor" /> 開始新執行
                                        </button>
                                    )}
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
                                    navigate(`/runs/${runId}${activeFolderId ? `?from_folder=${activeFolderId}` : ''}`);
                                }}
                            />

                            {displayedRuns.length === 0 && !isLoading ? (
                                runSearchQuery.trim() ? (
                                    <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 border-dashed text-slate-500">
                                        <Search className="w-12 h-12 text-slate-300 mb-4" />
                                        <p className="mb-2 text-lg font-medium text-slate-900">找不到符合「{runSearchQuery}」的執行</p>
                                        <button
                                            onClick={() => setRunSearchQuery('')}
                                            className="text-sm text-primary-600 hover:underline"
                                        >
                                            清除搜尋
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 border-dashed text-slate-500">
                                        <Play className="w-12 h-12 text-slate-300 mb-4" />
                                        <p className="mb-2 text-lg font-medium text-slate-900">尚無測試執行</p>
                                        <p className="mb-6 text-sm">開始新的測試執行以追蹤案例結果。</p>
                                        {writable && (
                                            <button
                                                onClick={() => { setDuplicateData(null); setIsCreatingRun(true); }}
                                                className="btn-primary flex items-center gap-2"
                                            >
                                                <Play className="w-4 h-4" fill="currentColor" /> 開始新執行
                                            </button>
                                        )}
                                    </div>
                                )
                            ) : isLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                                </div>
                            ) : (
                                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                                    {/* List header */}
                                    <div className="flex items-center gap-4 px-4 py-2 border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        <span className="flex-1">執行名稱</span>
                                        <span className="w-40 shrink-0">進度</span>
                                        <span className="w-20 shrink-0 opacity-0">操作</span>
                                    </div>
                                    {displayedRuns.map(run => (
                                        <DraggableRunCard
                                            key={`run-${run.id}`}
                                            run={run}
                                            onClick={() => navigate(`/runs/${run.id}${activeFolderId ? `?from_folder=${activeFolderId}` : ''}`)}
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

            {/* Copy Folder Date Modal */}
            {copyFolderDateModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                            <CalendarDays className="w-5 h-5 text-primary-600" />
                            <h2 className="text-lg font-bold text-slate-900">批次複製執行</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            {copyFolderDateModal.hasTemplate ? (
                                <p className="text-sm text-slate-600">
                                    此資料夾內有含 <code className="px-1 py-0.5 bg-slate-100 rounded text-xs font-mono">$template</code> 的執行名稱，請選擇日期以替換：
                                </p>
                            ) : (
                                <p className="text-sm text-slate-600">
                                    選擇複製後執行的日期標記（選填）：
                                </p>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">日期</label>
                                <input
                                    type="date"
                                    value={copyFolderDate}
                                    onChange={(e) => setCopyFolderDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                />
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setCopyFolderDateModal(null)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleConfirmCopyFolder}
                                disabled={isCopyingFolder}
                                className="btn-primary flex items-center gap-2"
                            >
                                {isCopyingFolder ? <><Loader2 className="w-4 h-4 animate-spin" /> 複製中...</> : '確認複製'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
