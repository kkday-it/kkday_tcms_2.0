import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, Loader2, Trash2, Pencil, Folder as FolderIcon, Download, ChevronDown } from 'lucide-react';
import { DndContext, DragEndEvent, closestCenter, useDroppable, useSensor, useSensors, PointerSensor, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import api from '../lib/api';
import PlanFolderNode from '../components/plans/PlanFolderNode';
import EditPlanFolderModal from '../components/plans/EditPlanFolderModal';
import EditPlanModal, { CaseFolder } from '../components/plans/EditPlanModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanFolder {
    id: number;
    name: string;
    parent_id?: number | null;
    project_id: number;
}

interface TestRun {
    id: number;
    title: string;
}

interface TestCase {
    id: number;
    title: string;
    suite_id: number;
}

interface TestPlan {
    id: number;
    title: string;
    description?: string;
    status: string;
    folder_id?: number | null;
    run_ids?: number[];
    case_ids?: number[];
}

// ─── Draggable Plan Card ───────────────────────────────────────────────────────

function DraggablePlanCard({ plan, onEdit, onDelete }: { plan: TestPlan; onEdit: () => void; onDelete: () => void }) {
    const navigate = useNavigate();
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `plan-${plan.id}`,
        data: { type: 'plan', plan }
    });

    const style = transform ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 50 : 'auto',
        opacity: isDragging ? 0.7 : 1,
    } : undefined;

    const statusColor = {
        Draft: 'bg-amber-50 text-amber-700 border-amber-200',
        Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        Completed: 'bg-blue-50 text-blue-700 border-blue-200',
        Archived: 'bg-slate-50 text-slate-600 border-slate-200',
    }[plan.status] ?? 'bg-slate-50 text-slate-600 border-slate-200';

    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={() => !isDragging && navigate(`/plans/${plan.id}`)}
            className={`bg-white border ${isDragging ? 'border-primary-400 shadow-md' : 'border-slate-200 shadow-sm hover:shadow-md hover:border-primary-200 cursor-pointer'} rounded-xl p-6 transition-all relative`}
        >
            {/* Drag handle overlay */}
            <div className="absolute inset-0 cursor-grab active:cursor-grabbing z-0" {...attributes} {...listeners} />

            <div className="relative z-10 pointer-events-none flex items-start justify-between">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-base font-bold text-slate-900 truncate">{plan.title}</h3>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor}`}>{plan.status}</span>
                    </div>
                    <p className="text-sm text-slate-500 mb-3">{plan.description || 'No description provided.'}</p>
                    <p className="text-xs text-slate-400 font-mono">Plan ID: #{plan.id}</p>
                </div>

                <div className="flex items-center gap-1 pointer-events-auto ml-4 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit Plan">
                        <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete Plan">
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Root dropzone ─────────────────────────────────────────────────────────────

function RootDroppableArea({ children, className }: { children: React.ReactNode; className?: string }) {
    const { setNodeRef, isOver } = useDroppable({ id: 'root' });
    return (
        <div ref={setNodeRef} className={`transition-colors ${className} ${isOver ? 'bg-primary-50/50' : ''}`}>
            {children}
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TestPlans() {
    const projectId = 1;

    const [plans, setPlans] = useState<TestPlan[]>([]);
    const [folders, setFolders] = useState<PlanFolder[]>([]);
    const [runs, setRuns] = useState<TestRun[]>([]);
    const [cases, setCases] = useState<TestCase[]>([]);
    const [caseFolders, setCaseFolders] = useState<CaseFolder[]>([]);

    const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Modal state
    const [editingPlan, setEditingPlan] = useState<TestPlan | null | undefined>(undefined); // undefined = closed
    const [isAddingFolder, setIsAddingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderParentId, setNewFolderParentId] = useState<number | null>(null);
    const [isEditFolderModalOpen, setIsEditFolderModalOpen] = useState(false);
    const [editingFolder, setEditingFolder] = useState<PlanFolder | null>(null);

    // Sidebar resize
    const [sidebarWidth, setSidebarWidth] = useState(256);
    const isResizing = useRef(false);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
        isResizing.current = true;
        const startX = mouseDownEvent.clientX;
        const startWidth = sidebarWidth;
        const doDrag = (e: MouseEvent) => {
            if (!isResizing.current) return;
            const w = startWidth + e.clientX - startX;
            if (w >= 180 && w <= 500) setSidebarWidth(w);
        };
        const stopDrag = () => {
            isResizing.current = false;
            document.removeEventListener('mousemove', doDrag);
            document.removeEventListener('mouseup', stopDrag);
            document.body.style.userSelect = 'auto';
        };
        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
        document.body.style.userSelect = 'none';
    }, [sidebarWidth]);

    // ── Fetch ──────────────────────────────────────────────────────────────────

    const fetchFolders = async () => {
        try {
            const res = await api.get(`/plan-folders/project/${projectId}`);
            setFolders(res.data);
        } catch (e) {
            console.error('Failed to load plan folders', e);
        }
    };

    const fetchPlans = async () => {
        setIsLoading(true);
        try {
            const res = await api.get(`/plans/project/${projectId}`);
            let data: TestPlan[] = res.data;
            if (activeFolderId !== null) {
                data = data.filter(p => p.folder_id === activeFolderId);
            }
            setPlans(data);
        } catch (e) {
            console.error('Failed to load plans', e);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchRuns = async () => {
        try {
            const res = await api.get(`/runs/project/${projectId}`);
            setRuns(res.data);
        } catch (e) { /* silent */ }
    };

    const fetchCases = async () => {
        try {
            const res = await api.get(`/cases/project/${projectId}`);
            setCases(res.data);
        } catch (e) { /* silent */ }
    };

    const fetchSuites = async () => {
        try {
            const res = await api.get(`/suites/project/${projectId}`);
            setCaseFolders(res.data.map((s: any) => ({ id: s.id, name: s.name })));
        } catch (e) { /* silent */ }
    };

    useEffect(() => { fetchFolders(); fetchRuns(); fetchCases(); fetchSuites(); }, []);
    useEffect(() => { fetchPlans(); }, [activeFolderId]);

    // ── Export ─────────────────────────────────────────────────────────────────
    const [isExportOpen, setIsExportOpen] = useState(false);
    const handleExportPlans = async (format: 'csv' | 'json') => {
        setIsExportOpen(false);
        try {
            const params = new URLSearchParams({ project_id: String(projectId), format });
            const response = await api.get(`/plans/export?${params}`, { responseType: 'blob' });
            const url = URL.createObjectURL(response.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `test_plans.${format}`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed');
        }
    };

    // ── Folder Actions ─────────────────────────────────────────────────────────

    const handleCreateFolder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFolderName.trim()) return;
        try {
            await api.post('/plan-folders/', { name: newFolderName.trim(), project_id: projectId, parent_id: newFolderParentId });
            setNewFolderName(''); setIsAddingFolder(false);
            fetchFolders();
        } catch (err) { alert('Failed to create folder'); }
    };

    const handleDeleteFolder = async (folderId: number) => {
        if (!confirm('Delete this folder? Plans inside will become unassigned.')) return;
        try {
            await api.delete(`/plan-folders/${folderId}`);
            if (activeFolderId === folderId) setActiveFolderId(null);
            fetchFolders();
        } catch (err) { alert('Failed to delete folder'); }
    };

    // ── Plan Actions ───────────────────────────────────────────────────────────

    const handleDeletePlan = async (planId: number) => {
        if (!confirm('Delete this test plan?')) return;
        try {
            await api.delete(`/plans/${planId}`);
            fetchPlans();
        } catch (err) { alert('Failed to delete plan'); }
    };

    // ── Drag & Drop ────────────────────────────────────────────────────────────

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const activeStr = active.id.toString();
        const overStr = over.id.toString();
        const targetId = overStr === 'root' ? null : parseInt(overStr.replace('folder-', ''));

        try {
            if (activeStr.startsWith('plan-')) {
                const planId = parseInt(activeStr.replace('plan-', ''));
                await api.put(`/plans/${planId}`, { folder_id: targetId });
                fetchPlans();
            } else if (activeStr.startsWith('folder-')) {
                const folderId = parseInt(activeStr.replace('folder-', ''));
                await api.put(`/plan-folders/${folderId}`, { parent_id: targetId });
                fetchFolders();
            }
        } catch (err) { alert('Failed to move item'); }
    };

    // ── Tree Rendering ─────────────────────────────────────────────────────────

    const renderFolderTree = (parentId: number | null, level = 0): React.ReactNode => {
        const children = folders.filter(f => f.parent_id === parentId);
        return (
            <div className="space-y-0.5">
                {children.map(folder => (
                    <PlanFolderNode
                        key={folder.id}
                        folder={folder}
                        level={level}
                        isActive={activeFolderId === folder.id}
                        planCount={plans.filter(p => p.folder_id === folder.id).length}
                        onSelect={(id) => setActiveFolderId(id)}
                        onAddSubFolder={(id) => { setIsAddingFolder(true); setNewFolderParentId(id); setNewFolderName(''); }}
                        onEdit={(f) => { setEditingFolder(f as PlanFolder); setIsEditFolderModalOpen(true); }}
                        onDelete={handleDeleteFolder}
                        childrenNodes={(folders.some(f => f.parent_id === folder.id) || (isAddingFolder && newFolderParentId === folder.id)) ? renderFolderTree(folder.id, level + 1) : undefined}
                    />
                ))}
                {isAddingFolder && newFolderParentId === parentId && (
                    <div style={{ paddingLeft: level === 0 ? '8px' : `${level * 16 + 8}px`, paddingRight: '8px' }} className="mt-1 mb-2">
                        <form onSubmit={handleCreateFolder} className="bg-white rounded border border-primary-200 shadow-sm overflow-hidden">
                            <input autoFocus type="text" value={newFolderName}
                                onChange={e => setNewFolderName(e.target.value)}
                                placeholder="Folder name…"
                                className="w-full px-2 py-1.5 text-sm outline-none"
                                onBlur={() => { if (!newFolderName.trim()) setIsAddingFolder(false); }} />
                            <div className="flex bg-slate-50 px-2 py-1 gap-1 border-t border-slate-100">
                                <button type="submit" disabled={!newFolderName.trim()}
                                    className="flex-1 text-xs font-medium text-primary-600 hover:bg-primary-50 rounded py-1 disabled:opacity-50">Save</button>
                                <button type="button" onClick={() => { setIsAddingFolder(false); setNewFolderName(''); }}
                                    className="flex-1 text-xs font-medium text-slate-500 hover:bg-slate-200 rounded py-1">Cancel</button>
                            </div>
                        </form>
                    </div>
                )}
            </div>
        );
    };

    return (
        <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <div className="flex-1 flex overflow-hidden">

                    {/* ── Sidebar ──────────────────────────────────────────────── */}
                    <div style={{ width: `${sidebarWidth}px`, minWidth: '180px', maxWidth: '500px' }}
                        className="bg-slate-50 border-r border-slate-200 flex flex-col h-full shrink-0 relative">

                        {/* Resizer */}
                        <div onMouseDown={startResizing}
                            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary-300 active:bg-primary-500 z-10 opacity-0 hover:opacity-100 transition-opacity translate-x-1/2" />

                        <div className="p-4 border-b border-slate-200 shrink-0">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-bold tracking-wider text-slate-500 uppercase">Folders</h2>
                                <button onClick={() => { setIsAddingFolder(true); setNewFolderParentId(null); setNewFolderName(''); }}
                                    className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded">
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto py-2">
                            <RootDroppableArea className={`w-full flex items-center justify-between px-4 py-2 text-sm cursor-pointer group hover:bg-slate-100 ${activeFolderId === null ? 'bg-primary-50 text-primary-700 font-medium' : 'text-slate-700'}`}>
                                <div className="flex items-center gap-2 flex-1 relative z-10" onClick={() => setActiveFolderId(null)}>
                                    <FolderIcon className={`w-4 h-4 ${activeFolderId === null ? 'text-primary-500' : 'text-slate-400'}`} />
                                    <span>All Plans</span>
                                </div>
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${activeFolderId === null ? 'bg-primary-100 text-primary-600' : 'bg-slate-200 text-slate-500'}`}>{plans.length}</span>
                            </RootDroppableArea>

                            <div className="mt-2 px-2">
                                {renderFolderTree(null)}
                            </div>
                        </div>
                    </div>

                    {/* ── Main Content ──────────────────────────────────────────── */}
                    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
                        <div className="flex-1 p-8 overflow-y-auto">
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center">
                                        <ClipboardList className="w-6 h-6 text-teal-500" />
                                    </div>
                                    <div>
                                        <h1 className="text-2xl font-bold text-slate-900">
                                            {activeFolderId ? folders.find(f => f.id === activeFolderId)?.name || 'Folder' : 'Test Plans'}
                                        </h1>
                                        <p className="text-sm text-slate-500">Group and manage test scopes and reports.</p>
                                    </div>
                                </div>
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
                                                <button onClick={() => handleExportPlans('csv')} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50">CSV</button>
                                                <button onClick={() => handleExportPlans('json')} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50">JSON</button>
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => setEditingPlan(null)}
                                        className="btn-primary flex items-center gap-2">
                                        <Plus className="w-4 h-4" /> New Plan
                                    </button>
                                </div>
                            </div>

                            {isLoading ? (
                                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>
                            ) : plans.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-slate-500 bg-white rounded-xl border border-dashed border-slate-200">
                                    <ClipboardList className="w-12 h-12 text-slate-300 mb-4" />
                                    <p className="text-lg font-medium text-slate-700 mb-1">No test plans here</p>
                                    <p className="text-sm mb-6">Create a plan to group test runs and cases.</p>
                                    <button onClick={() => setEditingPlan(null)} className="btn-primary flex items-center gap-2">
                                        <Plus className="w-4 h-4" /> New Plan
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4">
                                    {plans.map(plan => (
                                        <DraggablePlanCard
                                            key={`plan-${plan.id}`}
                                            plan={plan}
                                            onEdit={() => setEditingPlan(plan)}
                                            onDelete={() => handleDeletePlan(plan.id)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </DndContext>

            {/* Edit Folder Modal */}
            <EditPlanFolderModal
                isOpen={isEditFolderModalOpen}
                onClose={() => setIsEditFolderModalOpen(false)}
                folder={editingFolder}
                allFolders={folders}
                onSaved={fetchFolders}
            />

            {/* Edit/Create Plan Modal */}
            {editingPlan !== undefined && (
                <EditPlanModal
                    plan={editingPlan}
                    folders={folders}
                    runs={runs}
                    cases={cases}
                    caseFolders={caseFolders}
                    onClose={() => setEditingPlan(undefined)}
                    onSaved={() => { fetchPlans(); setEditingPlan(undefined); }}
                />
            )}
        </>
    );
}
