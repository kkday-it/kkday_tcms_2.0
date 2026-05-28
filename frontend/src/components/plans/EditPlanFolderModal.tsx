import { useState, useEffect, useMemo } from 'react';
import { X, Loader2 } from 'lucide-react';
import api from '../../lib/api';
import SearchableSelect, { SearchableOption } from '../common/SearchableSelect';

interface PlanFolder {
    id: number;
    name: string;
    parent_id?: number | null;
}

interface EditPlanFolderModalProps {
    isOpen: boolean;
    onClose: () => void;
    folder: PlanFolder | null;
    allFolders: PlanFolder[];
    onSaved: () => void;
}

export default function EditPlanFolderModal({ isOpen, onClose, folder, allFolders, onSaved }: EditPlanFolderModalProps) {
    const [name, setName] = useState('');
    const [parentId, setParentId] = useState<number | ''>('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (folder && isOpen) {
            setName(folder.name);
            setParentId(folder.parent_id || '');
        }
    }, [folder, isOpen]);

    // Hooks must run in the same order every render — keep useMemo above the early
    // return below. Previously the order was `useMemo` AFTER the conditional return,
    // which triggered "Rendered more hooks than during the previous render" on first
    // open and blanked the page.
    const parentOptions = useMemo<SearchableOption[]>(() => {
        if (!folder) return [];
        const blocked = new Set<number>([folder.id]);
        let grew = true;
        while (grew) {
            grew = false;
            for (const f of allFolders) {
                if (f.parent_id != null && blocked.has(f.parent_id) && !blocked.has(f.id)) {
                    blocked.add(f.id);
                    grew = true;
                }
            }
        }
        const byId = new Map(allFolders.map(f => [f.id, f]));
        const pathOf = (id: number) => {
            const parts: string[] = [];
            let cur = byId.get(id);
            const seen = new Set<number>();
            while (cur && !seen.has(cur.id)) {
                seen.add(cur.id);
                parts.unshift(cur.name);
                cur = cur.parent_id != null ? byId.get(cur.parent_id) : undefined;
            }
            return parts;
        };
        // Full breadcrumb as label so hierarchy stays visible even after the
        // picker collapses to the selected value. Sort on the same string for
        // tree-like dropdown ordering.
        return allFolders
            .filter(f => !blocked.has(f.id))
            .map(f => ({
                value: f.id,
                label: pathOf(f.id).join(' / '),
            } satisfies SearchableOption))
            .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));
    }, [allFolders, folder]);

    if (!isOpen || !folder) return null;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsSaving(true);
        try {
            await api.put(`/plan-folders/${folder.id}`, {
                name: name.trim(),
                parent_id: parentId === '' ? null : Number(parentId)
            });
            onSaved();
            onClose();
        } catch (error) {
            console.error('Failed to update folder:', error);
            alert('Failed to update folder');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h2 className="text-lg font-semibold text-slate-800">Edit Folder</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-100 rounded-md">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSave} className="p-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Folder Name *</label>
                            <input
                                type="text"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                                placeholder="Enter folder name"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Parent Folder (Move)</label>
                            <SearchableSelect
                                value={parentId}
                                onChange={v => setParentId(v === '' ? '' : Number(v))}
                                options={parentOptions}
                                placeholder="搜尋上層資料夾... (留空為頂層)"
                                ariaLabel="Parent folder"
                            />
                            <p className="mt-1.5 text-xs text-slate-500">Select a parent folder to nest this folder. Clear to make it top-level.</p>
                        </div>
                    </div>

                    <div className="mt-8 flex items-center justify-end gap-3">
                        <button type="button" onClick={onClose} disabled={isSaving}
                            className="px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50">
                            Cancel
                        </button>
                        <button type="submit" disabled={isSaving || !name.trim()} className="btn-primary flex items-center justify-center gap-2 min-w-[100px]">
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
