import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import api from '../../lib/api';

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

    // Filter out the current suite and its children to prevent circular nesting 
    // (For simplicity we just filter the current suite itself, deep validation should happen in backend)
    const availableParents = allSuites.filter(s => s.id !== suite.id);

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
                            <select
                                value={parentSuiteId}
                                onChange={(e) => setParentSuiteId(e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm transition-shadow bg-white text-slate-700"
                            >
                                <option value="">None (Top Level)</option>
                                {availableParents.map(parent => (
                                    <option key={parent.id} value={parent.id}>{parent.name}</option>
                                ))}
                            </select>
                            <p className="mt-1.5 text-xs text-slate-500">Select a parent suite to move this suite underneath it.</p>
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
