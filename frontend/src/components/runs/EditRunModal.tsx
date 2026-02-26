import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import api from '../../lib/api';

interface TestRunFolder {
    id: number;
    name: string;
    parent_id?: number | null;
}

interface TestRun {
    id: number;
    title: string;
    run_type?: string;
    folder_id?: number | null;
}

interface EditRunModalProps {
    isOpen: boolean;
    onClose: () => void;
    run: TestRun | null;
    folders: TestRunFolder[];
    onUpdated: () => void;
}

export default function EditRunModal({ isOpen, onClose, run, folders, onUpdated }: EditRunModalProps) {
    const [title, setTitle] = useState('');
    const [runType, setRunType] = useState('Feature Test');
    const [folderId, setFolderId] = useState<number | ''>('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen && run) {
            setTitle(run.title);
            setRunType(run.run_type || 'Feature Test');
            setFolderId(run.folder_id ?? '');
        }
    }, [isOpen, run]);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!run || !title.trim()) return;

        setIsSubmitting(true);

        try {
            await api.put(`/runs/${run.id}`, {
                title: title.trim(),
                run_type: runType,
                folder_id: folderId === '' ? null : folderId
            });
            onUpdated();
            onClose();
        } catch (error) {
            console.error("Failed to update test run:", error);
            alert("Failed to update test run.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen || !run) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-6 border-b border-slate-200">
                    <h2 className="text-xl font-bold text-slate-900">Edit Test Run</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleUpdate} className="p-6 flex-1 overflow-y-auto">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                                Run Title <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 transition-shadow"
                                placeholder="e.g. v1.5 Release Regression"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Run Type</label>
                            <select
                                value={runType}
                                onChange={(e) => setRunType(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 transition-shadow bg-white"
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
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Folder</label>
                            <select
                                value={folderId}
                                onChange={(e) => setFolderId(e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 transition-shadow bg-white"
                            >
                                <option value="">(No Folder)</option>
                                {folders.map(f => (
                                    <option key={f.id} value={f.id}>{f.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!title.trim() || isSubmitting}
                            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isSubmitting ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                            ) : (
                                "Save Changes"
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
