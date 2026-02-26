import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import api from '../../lib/api';

interface TestStep {
    action: string;
    data?: string;
    expected_result: string;
}

interface AppUser {
    id: number;
    username: string;
}

interface TestCaseEditorProps {
    isOpen: boolean;
    onClose: () => void;
    caseId?: number | null; // null if creating new
    suiteId?: number | null; // required if creating new
    onSaved?: () => void;
}

export default function TestCaseEditor({ isOpen, onClose, caseId, suiteId, onSaved }: TestCaseEditorProps) {
    const [title, setTitle] = useState('');
    const [lifecycleStatus, setLifecycleStatus] = useState('Draft');
    const [defaultOwnerId, setDefaultOwnerId] = useState<number | ''>('');
    const [priority, setPriority] = useState('Medium');
    const [automationStatus, setAutomationStatus] = useState('Manual');
    const [preconditions, setPreconditions] = useState('');
    const [externalId, setExternalId] = useState('');
    const [tags, setTags] = useState('');
    const [jiraKeys, setJiraKeys] = useState('');
    const [steps, setSteps] = useState<TestStep[]>([{ action: '', data: '', expected_result: '' }]);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [users, setUsers] = useState<AppUser[]>([]);

    useEffect(() => {
        if (isOpen) {
            // Fetch users for the assignee dropdown
            api.get('/users/').then(res => setUsers(res.data)).catch(console.error);
            if (caseId) {
                // Fetch existing case
                setIsLoading(true);
                api.get(`/cases/${caseId}`)
                    .then(res => {
                        const data = res.data;
                        setTitle(data.title);
                        setLifecycleStatus(data.lifecycle_status || 'Draft');
                        setDefaultOwnerId(data.default_owner_id || '');
                        setPriority(data.priority || 'Medium');
                        setAutomationStatus(data.automation_status || 'Manual');
                        setPreconditions(data.preconditions || '');
                        setExternalId(data.external_id || '');

                        // Parse JSON tags back to comma string if needed
                        try {
                            if (data.tags && data.tags.startsWith('[')) {
                                setTags(JSON.parse(data.tags).join(', '));
                            } else {
                                setTags(data.tags || '');
                            }
                        } catch {
                            setTags(data.tags || '');
                        }

                        setJiraKeys(data.jira_keys || '');

                        if (data.steps && data.steps.length > 0) {
                            setSteps(data.steps.map((s: any) => ({
                                action: s.action,
                                data: s.data || '',
                                expected_result: s.expected_result
                            })));
                        } else {
                            setSteps([{ action: '', data: '', expected_result: '' }]);
                        }
                    })
                    .catch(e => console.error("Failed to fetch case", e))
                    .finally(() => setIsLoading(false));
            } else {
                // Reset form for new case
                setTitle('');
                setLifecycleStatus('Draft');
                setDefaultOwnerId('');
                setPriority('Medium');
                setAutomationStatus('Manual');
                setPreconditions('');
                setExternalId('');
                setTags('');
                setJiraKeys('');
                setSteps([{ action: '', data: '', expected_result: '' }]);
            }
        }
    }, [isOpen, caseId]);

    if (!isOpen) return null;

    const handleAddStep = () => {
        setSteps([...steps, { action: '', data: '', expected_result: '' }]);
    };

    const handleRemoveStep = (index: number) => {
        setSteps(steps.filter((_, i) => i !== index));
    };

    const handleStepChange = (index: number, field: keyof TestStep, value: string) => {
        const newSteps = [...steps];
        newSteps[index] = { ...newSteps[index], [field]: value };
        setSteps(newSteps);
    };

    const handleSave = async () => {
        if (!title.trim()) {
            alert("Title is required");
            return;
        }

        setIsSaving(true);
        try {
            // Convert tags to JSON array if they are comma separated
            let tagsJson = tags;
            if (tags.trim()) {
                const tagArray = tags.split(',').map(t => t.trim()).filter(Boolean);
                tagsJson = JSON.stringify(tagArray);
            } else {
                tagsJson = '';
            }

            const payload = {
                title,
                lifecycle_status: lifecycleStatus,
                default_owner_id: defaultOwnerId ? Number(defaultOwnerId) : null,
                priority,
                automation_status: automationStatus,
                preconditions,
                external_id: externalId || null,
                tags: tagsJson || null,
                jira_keys: jiraKeys || null,
                suite_id: suiteId,
                steps: steps.filter(s => s.action.trim() || s.expected_result.trim()) // filter out empty steps
            };

            if (caseId) {
                // Update
                await api.put(`/cases/${caseId}`, payload);
            } else {
                // Create
                if (!suiteId) {
                    alert("Suite ID is missing");
                    return;
                }
                await api.post(`/cases/`, payload);
            }
            if (onSaved) onSaved();
            onClose();
        } catch (error) {
            console.error("Failed to save case", error);
            alert("Failed to save test case. Please check console.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-[1px]" onClick={onClose} />

            <div className="relative w-full max-w-3xl bg-white h-full border-l border-slate-200 shadow-xl flex flex-col animate-in slide-in-from-right">
                {/* Header */}
                <div className="flex items-center justify-between px-8 py-5 border-b border-slate-200 bg-white">
                    <h2 className="text-xl font-bold text-slate-900">{caseId ? `Edit TC-${caseId}` : 'Create Test Case'}</h2>
                    <button onClick={onClose} disabled={isSaving} className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-md transition-colors disabled:opacity-50">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                    </div>
                ) : (
                    <>
                        {/* Body scrollable area */}
                        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8 bg-white">
                            {/* Basic Info */}
                            <section className="space-y-5">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-900 mb-1.5">Title <span className="text-rose-500">*</span></label>
                                    <input
                                        type="text"
                                        className="w-full rounded-md border border-slate-200 py-2 px-3 text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:text-sm"
                                        placeholder="Enter test case title"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        autoFocus
                                    />
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-900 mb-1.5">Status</label>
                                        <select
                                            value={lifecycleStatus}
                                            onChange={(e) => setLifecycleStatus(e.target.value)}
                                            className="w-full rounded-md border border-slate-200 py-2 px-3 text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:text-sm bg-white"
                                        >
                                            <option value="Draft">Draft</option>
                                            <option value="Approved">Approved</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-900 mb-1.5">Default Owner</label>
                                        <select
                                            value={defaultOwnerId}
                                            onChange={(e) => setDefaultOwnerId(e.target.value ? Number(e.target.value) : '')}
                                            className="w-full rounded-md border border-slate-200 py-2 px-3 text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:text-sm bg-white"
                                        >
                                            <option value="">Unassigned</option>
                                            {users.map(u => (
                                                <option key={u.id} value={u.id}>{u.username}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-900 mb-1.5">Priority</label>
                                        <select
                                            value={priority}
                                            onChange={(e) => setPriority(e.target.value)}
                                            className="w-full rounded-md border border-slate-200 py-2 px-3 text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:text-sm bg-white"
                                        >
                                            <option value="High">High</option>
                                            <option value="Medium">Medium</option>
                                            <option value="Low">Low</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-900 mb-1.5">Automation</label>
                                        <select
                                            value={automationStatus}
                                            onChange={(e) => setAutomationStatus(e.target.value)}
                                            className="w-full rounded-md border border-slate-200 py-2 px-3 text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:text-sm bg-white"
                                        >
                                            <option value="Manual">Manual</option>
                                            <option value="Automated">Automated</option>
                                        </select>
                                    </div>
                                </div>
                            </section>

                            {/* Zephyr / External Fields */}
                            <section className="grid grid-cols-1 md:grid-cols-3 gap-5 border-t border-slate-100 pt-5">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-900 mb-1.5">External ID (Zephyr)</label>
                                    <input
                                        type="text"
                                        className="w-full rounded-md border border-slate-200 py-2 px-3 text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:text-sm"
                                        placeholder="e.g. KQT-T12345"
                                        value={externalId}
                                        onChange={(e) => setExternalId(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-900 mb-1.5">Tags (Comma separated)</label>
                                    <input
                                        type="text"
                                        className="w-full rounded-md border border-slate-200 py-2 px-3 text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:text-sm"
                                        placeholder="Web, Regression"
                                        value={tags}
                                        onChange={(e) => setTags(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-900 mb-1.5">Jira Keys (Comma separated)</label>
                                    <input
                                        type="text"
                                        className="w-full rounded-md border border-slate-200 py-2 px-3 text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:text-sm"
                                        placeholder="e.g. KQT-12011"
                                        value={jiraKeys}
                                        onChange={(e) => setJiraKeys(e.target.value)}
                                    />
                                </div>
                            </section>

                            {/* Preconditions */}
                            <section>
                                <label className="block text-sm font-semibold text-slate-900 mb-1.5">Preconditions (Markdown)</label>
                                <textarea
                                    value={preconditions}
                                    onChange={(e) => setPreconditions(e.target.value)}
                                    className="w-full rounded-md border border-slate-200 py-2 px-3 text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 font-mono text-sm h-24 resize-y"
                                    placeholder="Conditions required before execution..."
                                />
                            </section>

                            {/* Steps */}
                            <section>
                                <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                                    <h3 className="text-sm font-semibold text-slate-900">Test Steps</h3>
                                </div>

                                <div className="space-y-2">
                                    {steps.map((step, idx) => (
                                        <div key={idx} className="flex gap-3 items-start p-3 rounded-md bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition-colors group">
                                            <div className="flex-shrink-0 w-6 h-6 rounded bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-semibold mt-1">
                                                {idx + 1}
                                            </div>
                                            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <div>
                                                    <input
                                                        type="text"
                                                        value={step.action}
                                                        onChange={(e) => handleStepChange(idx, 'action', e.target.value)}
                                                        className="w-full rounded border-0 border-b border-transparent hover:border-slate-200 focus:border-primary-500 focus:ring-0 px-0 py-1 text-sm bg-transparent"
                                                        placeholder="Action"
                                                    />
                                                </div>
                                                <div>
                                                    <input
                                                        type="text"
                                                        value={step.data || ''}
                                                        onChange={(e) => handleStepChange(idx, 'data', e.target.value)}
                                                        className="w-full rounded border-0 border-b border-transparent hover:border-slate-200 focus:border-primary-500 focus:ring-0 px-0 py-1 text-sm bg-transparent"
                                                        placeholder="Test Data (Optional)"
                                                    />
                                                </div>
                                                <div>
                                                    <input
                                                        type="text"
                                                        value={step.expected_result}
                                                        onChange={(e) => handleStepChange(idx, 'expected_result', e.target.value)}
                                                        className="w-full rounded border-0 border-b border-transparent hover:border-slate-200 focus:border-primary-500 focus:ring-0 px-0 py-1 text-sm bg-transparent"
                                                        placeholder="Expected Result"
                                                    />
                                                </div>
                                            </div>
                                            <button onClick={() => handleRemoveStep(idx)} className="mt-1 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 p-1">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={handleAddStep} className="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
                                    <Plus className="w-4 h-4" /> Add Step
                                </button>
                            </section>
                        </div>

                        {/* Footer */}
                        <div className="px-8 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 z-10">
                            <button onClick={onClose} disabled={isSaving} className="btn-secondary disabled:opacity-50">Cancel</button>
                            <button onClick={handleSave} disabled={isSaving} className="btn-primary flex items-center gap-2 shadow-sm disabled:opacity-50">
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                {isSaving ? 'Saving...' : 'Save Test Case'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
