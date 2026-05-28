import { useState, useEffect, useMemo } from 'react';
import { X, Loader2 } from 'lucide-react';
import api from '../../lib/api';
import SearchableSelect, { SearchableOption } from '../common/SearchableSelect';

interface TestSuite {
    id: number;
    name: string;
    parent_suite_id?: number | null;
}

interface EditSuiteModalProps {
    isOpen: boolean;
    onClose: () => void;
    suite: TestSuite | null;
    allSuites: TestSuite[];
    onSaved: () => void;
}

export default function EditSuiteModal({ isOpen, onClose, suite, allSuites, onSaved }: EditSuiteModalProps) {
    const [name, setName] = useState('');
    const [parentSuiteId, setParentSuiteId] = useState<number | ''>('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (suite && isOpen) {
            setName(suite.name);
            setParentSuiteId(suite.parent_suite_id || '');
        }
    }, [suite, isOpen]);

    // Hooks-of-rules: keep all useMemo / hook calls above any conditional return.
    // Previously these two `useMemo` lived AFTER `if (!isOpen || !suite) return null`,
    // so opening the modal added two hook calls between renders and React crashed
    // with "Rendered more hooks than during the previous render", blanking the page.
    // Filter out the current suite and its descendants to prevent circular nesting.
    // (Frontend hides obviously-bad targets; backend should still validate.)
    const availableParents = useMemo(() => {
        if (!suite) return [];
        const blocked = new Set<number>([suite.id]);
        let grew = true;
        while (grew) {
            grew = false;
            for (const s of allSuites) {
                if (s.parent_suite_id != null && blocked.has(s.parent_suite_id) && !blocked.has(s.id)) {
                    blocked.add(s.id);
                    grew = true;
                }
            }
        }
        return allSuites.filter(s => !blocked.has(s.id));
    }, [allSuites, suite]);

    const parentOptions = useMemo<SearchableOption[]>(() => {
        const byId = new Map(allSuites.map(s => [s.id, s]));
        const pathOf = (id: number) => {
            const parts: string[] = [];
            let cur = byId.get(id);
            const seen = new Set<number>();
            while (cur && !seen.has(cur.id)) {
                seen.add(cur.id);
                parts.unshift(cur.name);
                cur = cur.parent_suite_id != null ? byId.get(cur.parent_suite_id) : undefined;
            }
            return parts;
        };
        // Full breadcrumb as label so the picker (and the selected value after
        // it collapses) shows where the suite lives, not just the leaf name.
        return availableParents
            .map(p => ({
                value: p.id,
                label: pathOf(p.id).join(' / '),
            } satisfies SearchableOption))
            .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));
    }, [availableParents, allSuites]);

    if (!isOpen || !suite) return null;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsSaving(true);
        try {
            await api.put(`/suites/${suite.id}`, {
                name: name.trim(),
                parent_suite_id: parentSuiteId === '' ? null : Number(parentSuiteId)
            });
            onSaved();
            onClose();
        } catch (error) {
            console.error("Failed to update suite:", error);
            alert("Failed to update suite");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h2 className="text-lg font-semibold text-slate-800">Edit Suite</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-100 rounded-md">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSave} className="p-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Suite Name *</label>
                            <input
                                type="text"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm transition-shadow"
                                placeholder="Enter suite name"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Parent Suite (Move)</label>
                            <SearchableSelect
                                value={parentSuiteId}
                                onChange={v => setParentSuiteId(v === '' ? '' : Number(v))}
                                options={parentOptions}
                                placeholder="搜尋上層資料夾... (留空為頂層)"
                                ariaLabel="Parent suite"
                            />
                            <p className="mt-1.5 text-xs text-slate-500">Select a parent suite to move this suite underneath it. Clear to make it top-level.</p>
                        </div>
                    </div>

                    <div className="mt-8 flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
                            disabled={isSaving}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving || !name.trim()}
                            className="btn-primary flex items-center justify-center gap-2 min-w-[100px]"
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
