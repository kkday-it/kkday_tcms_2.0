import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import api from '../../lib/api';
import { useUsers } from '../../lib/useUsers';
import TagInput from '../common/TagInput';
import RichTextEditor from '../common/RichTextEditor';

interface TestStep {
    action: string;
    data?: string;
    expected_result: string;
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
    const [type, setType] = useState('Functional');
    const [layer, setLayer] = useState('E2E');
    const [preconditions, setPreconditions] = useState('');
    const [externalId, setExternalId] = useState('');
    const [tags, setTags] = useState('');
    const [labels, setLabels] = useState('');
    const [jiraKeys, setJiraKeys] = useState('');
    const [steps, setSteps] = useState<TestStep[]>([{ action: '', data: '', expected_result: '' }]);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { users } = useUsers();
    const [availableLabels, setAvailableLabels] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            // Fetch available labels for autocomplete
            api.get('/cases/labels/all').then(res => setAvailableLabels(res.data)).catch(console.error);

            if (caseId) {
                // Fetch existing case
                setIsLoading(true);
                api.get(`/cases/${caseId}`)
                    .then(res => {
                        const data = res.data;

                        // HTML cleaner for Zephyr XML import artifacts
                        // Preserves HTML structure for the rich text editor;
                        // only fixes common Zephyr-specific encoding issues.
                        const cleanHtml = (str: any) => {
                            if (!str) return '';
                            let cleaned = String(str)
                                .replace(/&nbsp;/gi, ' ')
                                // Convert legacy <br> to paragraph-friendly breaks
                                .replace(/<br\s*\/?>/gi, '</p><p>')
                                // Convert HTML image tags to a visible linked format
                                .replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, '<a href="$1" target="_blank">📎 Image</a>');
                            // Unescape basic HTML entities
                            cleaned = cleaned.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
                            // Wrap in paragraph if it doesn't start with an HTML tag
                            if (cleaned && !cleaned.trim().startsWith('<')) {
                                cleaned = `<p>${cleaned}</p>`;
                            }
                            return cleaned.trim();
                        };

                        setTitle(data.title);
                        setLifecycleStatus(data.lifecycle_status || 'Draft');
                        setDefaultOwnerId(data.default_owner_id || '');
                        setPriority(data.priority || 'Medium');
                        setAutomationStatus(data.automation_status || 'Manual');
                        setType(data.type || 'Functional');
                        setLayer(data.layer || 'E2E');
                        setPreconditions(cleanHtml(data.preconditions));
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

                        // Parse JSON labels back to comma string if needed
                        try {
                            if (data.labels && data.labels.startsWith('[')) {
                                setLabels(JSON.parse(data.labels).join(', '));
                            } else {
                                setLabels(data.labels || '');
                            }
                        } catch {
                            setLabels(data.labels || '');
                        }

                        setJiraKeys(data.jira_keys || '');

                        if (data.steps && data.steps.length > 0) {
                            setSteps(data.steps.map((s: any) => ({
                                action: cleanHtml(s.action),
                                data: cleanHtml(s.data),
                                expected_result: cleanHtml(s.expected_result)
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
                setType('Functional');
                setLayer('E2E');
                setPreconditions('');
                setExternalId('');
                setTags('');
                setLabels('');
                setJiraKeys('');
                setSteps([{ action: '', data: '', expected_result: '' }]);
            }
        }
    }, [isOpen, caseId]);

    // Auto-resize on initial load kept for backward compat (no-op now)
    useEffect(() => {
        if (!isOpen) return;
    }, [steps, preconditions, isOpen]);

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

            let labelsJson = labels;
            if (labels.trim()) {
                const labelArray = labels.split(',').map(l => l.trim()).filter(Boolean);
                labelsJson = JSON.stringify(labelArray);
            } else {
                labelsJson = '';
            }

            const payload = {
                title,
                lifecycle_status: lifecycleStatus,
                default_owner_id: defaultOwnerId ? Number(defaultOwnerId) : null,
                priority,
                automation_status: automationStatus,
                type,
                layer,
                preconditions,
                external_id: externalId || null,
                tags: tagsJson || null,
                labels: labelsJson || null,
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-100 animate-in fade-in duration-200">
            <div className="relative w-full h-full bg-white flex flex-col overflow-hidden max-w-7xl mx-auto xl:shadow-2xl xl:my-4 xl:rounded-xl xl:h-[calc(100vh-2rem)] border border-slate-200">
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
                                        <label className="block text-sm font-semibold text-slate-900 mb-1.5">Assignee</label>
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
                                            <option value="Highest">Highest</option>
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

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-900 mb-1.5">Layer</label>
                                        <select
                                            value={layer}
                                            onChange={(e) => setLayer(e.target.value)}
                                            className="w-full rounded-md border border-slate-200 py-2 px-3 text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:text-sm bg-white"
                                        >
                                            <option value="E2E">E2E</option>
                                            <option value="API">API</option>
                                            <option value="Unit">Unit</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-900 mb-1.5">Type</label>
                                        <select
                                            value={type}
                                            onChange={(e) => setType(e.target.value)}
                                            className="w-full rounded-md border border-slate-200 py-2 px-3 text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:text-sm bg-white"
                                        >
                                            <option value="Other">Other</option>
                                            <option value="Functional">Functional</option>
                                            <option value="Smoke">Smoke</option>
                                            <option value="Regression">Regression</option>
                                            <option value="Scenario">Scenario</option>
                                        </select>
                                    </div>
                                </div>
                            </section>

                            {/* Zephyr / External Fields */}
                            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 border-t border-slate-100 pt-5">
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
                                <div className="self-end" style={{ zIndex: 30 }}>
                                    <TagInput
                                        label="Tags"
                                        placeholder="Web, Regression"
                                        value={tags}
                                        onChange={setTags}
                                        availableOptions={[]} // Tags have no backend suggestions currently
                                    />
                                </div>
                                <div className="self-end" style={{ zIndex: 20 }}>
                                    <TagInput
                                        label="Labels"
                                        placeholder="B2C, Core"
                                        value={labels}
                                        onChange={setLabels}
                                        availableOptions={availableLabels}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-900 mb-1.5">Jira Keys</label>
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
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="block text-sm font-semibold text-slate-900">Preconditions</label>
                                </div>
                                <RichTextEditor
                                    value={preconditions}
                                    onChange={setPreconditions}
                                    placeholder="Conditions required before execution..."
                                    minHeight="96px"
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
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Action</span>
                                                    <RichTextEditor
                                                        value={step.action}
                                                        onChange={(v: string) => handleStepChange(idx, 'action', v)}
                                                        placeholder="Action"
                                                        minHeight="48px"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Test Data</span>
                                                    <RichTextEditor
                                                        value={step.data || ''}
                                                        onChange={(v: string) => handleStepChange(idx, 'data', v)}
                                                        placeholder="Test Data (optional)"
                                                        minHeight="48px"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Expected Result</span>
                                                    <RichTextEditor
                                                        value={step.expected_result}
                                                        onChange={(v: string) => handleStepChange(idx, 'expected_result', v)}
                                                        placeholder="Expected Result"
                                                        minHeight="48px"
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
