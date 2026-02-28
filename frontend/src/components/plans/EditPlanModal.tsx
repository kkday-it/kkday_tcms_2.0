import { useState, useEffect } from 'react';
import { Loader2, Search } from 'lucide-react';
import api from '../../lib/api';

export interface PlanFolder {
    id: number;
    name: string;
    parent_id?: number | null;
    project_id: number;
}

export interface TestRun {
    id: number;
    title: string;
}

export interface TestCase {
    id: number;
    title: string;
    suite_id: number;
}

export interface TestPlan {
    id: number;
    title: string;
    description?: string;
    status: string;
    folder_id?: number | null;
    run_ids?: number[];
    case_ids?: number[];
}

export default function EditPlanModal({ plan, folders, runs, cases, onClose, onSaved }: {
    plan: TestPlan | null;
    folders: PlanFolder[];
    runs: TestRun[];
    cases: TestCase[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const isNew = !plan;
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState('Draft');
    const [folderId, setFolderId] = useState<number | ''>('');
    const [selectedRunIds, setSelectedRunIds] = useState<number[]>([]);
    const [selectedCaseIds, setSelectedCaseIds] = useState<number[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [caseSearch, setCaseSearch] = useState('');
    const [activeTab, setActiveTab] = useState<'runs' | 'cases'>('runs');

    useEffect(() => {
        if (plan) {
            setTitle(plan.title);
            setDescription(plan.description || '');
            setStatus(plan.status);
            setFolderId(plan.folder_id || '');
            setSelectedRunIds(plan.run_ids || []);
            setSelectedCaseIds(plan.case_ids || []);
        } else {
            setTitle(''); setDescription(''); setStatus('Draft');
            setFolderId(''); setSelectedRunIds([]); setSelectedCaseIds([]);
        }
        setCaseSearch('');
        setActiveTab('runs');
    }, [plan]);

    const toggleRun = (id: number) =>
        setSelectedRunIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    const toggleCase = (id: number) =>
        setSelectedCaseIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    const filteredCases = cases.filter(c => c.title.toLowerCase().includes(caseSearch.toLowerCase()));

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        setIsSaving(true);
        try {
            const payload = {
                title: title.trim(),
                description: description.trim() || null,
                status,
                folder_id: folderId === '' ? null : Number(folderId),
                run_ids: selectedRunIds,
                case_ids: selectedCaseIds,
            };
            if (isNew) {
                await api.post('/plans/', { ...payload, project_id: 1 });
            } else {
                await api.put(`/plans/${plan!.id}`, payload);
            }
            onSaved();
            onClose();
        } catch (err) {
            console.error(err);
            alert('Failed to save plan');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 bg-white flex items-center justify-between shrink-0">
                    <h2 className="text-xl font-bold text-slate-900">{isNew ? 'New Test Plan' : 'Edit Test Plan'}</h2>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">✕</button>
                </div>

                <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
                    <div className="p-6 overflow-y-auto flex-1 space-y-4">
                        {/* Title */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Title <span className="text-rose-500">*</span></label>
                            <input type="text" required value={title} onChange={e => setTitle(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                                placeholder="Plan title" />
                        </div>
                        {/* Description */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-none"
                                placeholder="Optional description" />
                        </div>
                        {/* Status + Folder */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                                <select value={status} onChange={e => setStatus(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white">
                                    {['Draft', 'Active', 'Completed', 'Archived'].map(s => <option key={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Folder</label>
                                <select value={folderId} onChange={e => setFolderId(e.target.value === '' ? '' : Number(e.target.value))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white">
                                    <option value="">(No Folder)</option>
                                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Tabs: Test Runs / Test Cases */}
                        <div className="pt-2">
                            <div className="flex gap-1 border-b border-slate-200 mb-4">
                                {(['runs', 'cases'] as const).map(tab => (
                                    <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                                        className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === tab ? 'bg-white border-t border-x border-slate-200 text-primary-700 -mb-px relative z-10' : 'text-slate-500 hover:text-slate-700 border-t border-x border-transparent'}`}>
                                        {tab === 'runs' ? `Test Runs (${selectedRunIds.length})` : `Test Cases (${selectedCaseIds.length})`}
                                    </button>
                                ))}
                            </div>

                            {activeTab === 'runs' && (
                                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 bg-white">
                                    {runs.length === 0 && <p className="text-sm text-slate-400 p-4 text-center">No test runs available.</p>}
                                    {runs.map(run => (
                                        <label key={run.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors">
                                            <input type="checkbox" checked={selectedRunIds.includes(run.id)}
                                                onChange={() => toggleRun(run.id)}
                                                className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600" />
                                            <span className="text-sm text-slate-700 font-medium">{run.title}</span>
                                        </label>
                                    ))}
                                </div>
                            )}

                            {activeTab === 'cases' && (
                                <>
                                    <div className="relative mb-3">
                                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                        <input type="text" placeholder="Search cases…" value={caseSearch}
                                            onChange={e => setCaseSearch(e.target.value)}
                                            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all" />
                                    </div>
                                    <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 bg-white">
                                        {filteredCases.length === 0 && <p className="text-sm text-slate-400 p-4 text-center">No cases found.</p>}
                                        {filteredCases.map(tc => (
                                            <label key={tc.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors">
                                                <input type="checkbox" checked={selectedCaseIds.includes(tc.id)}
                                                    onChange={() => toggleCase(tc.id)}
                                                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600" />
                                                <span className="text-xs font-mono text-slate-400 w-12 shrink-0">TC-{tc.id}</span>
                                                <span className="text-sm text-slate-700 truncate">{tc.title}</span>
                                            </label>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 shrink-0 rounded-b-xl">
                        <button type="button" onClick={onClose} disabled={isSaving}
                            className="px-4 py-2 border border-slate-200 bg-white text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50">
                            Cancel
                        </button>
                        <button type="submit" disabled={isSaving || !title.trim()} className="btn-primary flex items-center gap-2 min-w-[120px] justify-center">
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : (isNew ? 'Create Plan' : 'Save Changes')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
