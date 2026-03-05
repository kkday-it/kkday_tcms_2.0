import { useState, useEffect } from 'react';
import { Loader2, Search, Plus, X, UploadCloud } from 'lucide-react';
import api from '../../lib/api';

interface DocEntry {
    title?: string;
    url: string;
}

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

export interface CaseFolder {
    id: number;
    name: string;
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
    prd_url?: string | null;
    sa_docs?: DocEntry[];
    sd_docs?: DocEntry[];
    ued_docs?: DocEntry[];
    qa_docs?: DocEntry[];
    mindmap_url?: string | null;
    timeline?: {
        rd?: { start?: string; end?: string };
        ued?: { start?: string; end?: string };
        qa?: { platform: string; start: string; end: string }[];
    };
    jira_unfix_filter_id?: number | null;
    jira_total_filter_id?: number | null;
    jira_display_fields?: string[];
}

export default function EditPlanModal({ plan, folders, runs, cases, caseFolders, onClose, onSaved }: {
    plan: TestPlan | null;
    folders: PlanFolder[];
    runs: TestRun[];
    cases: TestCase[];
    caseFolders: CaseFolder[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const isNew = !plan;
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState('Draft');
    const [folderId, setFolderId] = useState<number | ''>('');
    const [prdUrl, setPrdUrl] = useState('');
    const [saDocs, setSaDocs] = useState<DocEntry[]>([]);
    const [sdDocs, setSdDocs] = useState<DocEntry[]>([]);
    const [uedDocs, setUedDocs] = useState<DocEntry[]>([]);
    const [qaDocs, setQaDocs] = useState<DocEntry[]>([]);
    const [mindmapUrl, setMindmapUrl] = useState('');
    const [timeline, setTimeline] = useState<{
        rd?: { start: string; end: string };
        ued?: { start: string; end: string };
        qa: { platform: string; start: string; end: string }[];
    }>({ qa: [] });
    const [jiraUnfixFilterId, setJiraUnfixFilterId] = useState<string>('');
    const [jiraTotalFilterId, setJiraTotalFilterId] = useState<string>('');
    const [jiraDisplayFields, setJiraDisplayFields] = useState<string[]>(['key', 'summary', 'status', 'assignee', 'priority']);
    const [selectedRunIds, setSelectedRunIds] = useState<number[]>([]);
    const [selectedCaseIds, setSelectedCaseIds] = useState<number[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [caseSearch, setCaseSearch] = useState('');
    const [caseFolderFilter, setCaseFolderFilter] = useState<string>('');
    const [activeTab, setActiveTab] = useState<'runs' | 'cases'>('runs');
    const [metaTab, setMetaTab] = useState<'basic' | 'docs' | 'timeline' | 'jira' | 'runs'>('basic');

    const JIRA_FIELD_OPTIONS = ['key', 'summary', 'status', 'assignee', 'priority', 'created', 'labels'];

    useEffect(() => {
        if (plan) {
            setTitle(plan.title);
            setDescription(plan.description || '');
            setStatus(plan.status);
            setFolderId(plan.folder_id || '');
            setPrdUrl(plan.prd_url || '');
            setSaDocs(plan.sa_docs || []);
            setSdDocs(plan.sd_docs || []);
            setUedDocs(plan.ued_docs || []);
            setQaDocs(plan.qa_docs || []);
            setMindmapUrl(plan.mindmap_url || '');
            const t = plan.timeline || {};
            setTimeline({
                rd: t.rd ? { start: t.rd.start || '', end: t.rd.end || '' } : undefined,
                ued: t.ued ? { start: t.ued.start || '', end: t.ued.end || '' } : undefined,
                qa: t.qa || [],
            });
            setJiraUnfixFilterId(plan.jira_unfix_filter_id != null ? String(plan.jira_unfix_filter_id) : '');
            setJiraTotalFilterId(plan.jira_total_filter_id != null ? String(plan.jira_total_filter_id) : '');
            setJiraDisplayFields(plan.jira_display_fields?.length ? plan.jira_display_fields : ['key', 'summary', 'status', 'assignee', 'priority']);
            setSelectedRunIds(plan.run_ids || []);
            setSelectedCaseIds(plan.case_ids || []);
        } else {
            setTitle(''); setDescription(''); setStatus('Draft');
            setFolderId(''); setSelectedRunIds([]); setSelectedCaseIds([]);
            setPrdUrl(''); setSaDocs([]); setSdDocs([]);
            setUedDocs([]); setQaDocs([]); setMindmapUrl('');
            setTimeline({ qa: [] });
            setJiraUnfixFilterId(''); setJiraTotalFilterId('');
            setJiraDisplayFields(['key', 'summary', 'status', 'assignee', 'priority']);
        }
        setCaseSearch('');
        setCaseFolderFilter('');
        setActiveTab('runs');
        setMetaTab('basic');
    }, [plan]);

    const addDocEntry = (target: 'sa' | 'sd' | 'ued' | 'qa') => {
        if (target === 'sa') setSaDocs([...saDocs, { url: '' }]);
        else if (target === 'sd') setSdDocs([...sdDocs, { url: '' }]);
        else if (target === 'ued') setUedDocs([...uedDocs, { url: '' }]);
        else if (target === 'qa') setQaDocs([...qaDocs, { url: '' }]);
    };
    const updateDocEntry = (target: 'sa' | 'sd' | 'ued' | 'qa', idx: number, field: keyof DocEntry, value: string) => {
        let arr: DocEntry[] = [];
        if (target === 'sa') arr = [...saDocs];
        else if (target === 'sd') arr = [...sdDocs];
        else if (target === 'ued') arr = [...uedDocs];
        else if (target === 'qa') arr = [...qaDocs];
        arr[idx] = { ...arr[idx], [field]: value };
        if (target === 'sa') setSaDocs(arr);
        else if (target === 'sd') setSdDocs(arr);
        else if (target === 'ued') setUedDocs(arr);
        else if (target === 'qa') setQaDocs(arr);
    };
    const removeDocEntry = (target: 'sa' | 'sd' | 'ued' | 'qa', idx: number) => {
        if (target === 'sa') setSaDocs(saDocs.filter((_, i) => i !== idx));
        else if (target === 'sd') setSdDocs(sdDocs.filter((_, i) => i !== idx));
        else if (target === 'ued') setUedDocs(uedDocs.filter((_, i) => i !== idx));
        else if (target === 'qa') setQaDocs(qaDocs.filter((_, i) => i !== idx));
    };

    const addQaEntry = () => {
        setTimeline({ ...timeline, qa: [...(timeline.qa || []), { platform: 'APP', start: '', end: '' }] });
    };
    const updateQaEntry = (idx: number, field: 'platform' | 'start' | 'end', value: string) => {
        const qa = [...(timeline.qa || [])];
        qa[idx] = { ...qa[idx], [field]: value };
        setTimeline({ ...timeline, qa });
    };
    const removeQaEntry = (idx: number) => {
        setTimeline({ ...timeline, qa: (timeline.qa || []).filter((_, i) => i !== idx) });
    };

    const toggleJiraField = (f: string) => {
        setJiraDisplayFields(prev =>
            prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f].sort((a, b) => JIRA_FIELD_OPTIONS.indexOf(a) - JIRA_FIELD_OPTIONS.indexOf(b))
        );
    };

    const toggleRun = (id: number) =>
        setSelectedRunIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    const toggleCase = (id: number) =>
        setSelectedCaseIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    const filteredCases = cases
        .filter(c => caseFolderFilter === '' || String(c.suite_id) === caseFolderFilter)
        .filter(c => c.title.toLowerCase().includes(caseSearch.toLowerCase()));

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        setIsSaving(true);
        try {
            const tPayload =
                timeline.rd || timeline.ued || (timeline.qa && timeline.qa.length)
                    ? {
                        rd: timeline.rd?.start || timeline.rd?.end ? timeline.rd : undefined,
                        ued: timeline.ued?.start || timeline.ued?.end ? timeline.ued : undefined,
                        qa: timeline.qa?.filter(x => x.start || x.end).length ? timeline.qa : undefined,
                    }
                    : null;
            const payload = {
                title: title.trim(),
                description: description.trim() || null,
                status,
                folder_id: folderId === '' ? null : Number(folderId),
                prd_url: prdUrl.trim() || null,
                sa_docs: saDocs.filter(d => d.url.trim()).map(d => ({ title: d.title?.trim() || undefined, url: d.url.trim() })),
                sd_docs: sdDocs.filter(d => d.url.trim()).map(d => ({ title: d.title?.trim() || undefined, url: d.url.trim() })),
                ued_docs: uedDocs.filter(d => d.url.trim()).map(d => ({ title: d.title?.trim() || undefined, url: d.url.trim() })),
                qa_docs: qaDocs.filter(d => d.url.trim()).map(d => ({ title: d.title?.trim() || undefined, url: d.url.trim() })),
                mindmap_url: mindmapUrl.trim() || null,
                timeline: tPayload,
                jira_unfix_filter_id: jiraUnfixFilterId.trim() ? parseInt(jiraUnfixFilterId, 10) : null,
                jira_total_filter_id: jiraTotalFilterId.trim() ? parseInt(jiraTotalFilterId, 10) : null,
                jira_display_fields: jiraDisplayFields.length ? jiraDisplayFields : ['key', 'summary', 'status', 'assignee', 'priority'],
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
            <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 bg-white flex items-center justify-between shrink-0">
                    <h2 className="text-xl font-bold text-slate-900">{isNew ? 'New Test Plan' : 'Edit Test Plan'}</h2>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">✕</button>
                </div>

                {/* Meta tabs */}
                <div className="px-6 pt-3 flex gap-1 border-b border-slate-200 shrink-0 overflow-x-auto">
                    {(['basic', 'docs', 'timeline', 'jira', 'runs'] as const).map(t => (
                        <button key={t} type="button" onClick={() => setMetaTab(t)}
                            className={`px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap ${metaTab === t ? 'bg-slate-100 text-primary-700 border-b-2 border-primary-500 -mb-px' : 'text-slate-500 hover:text-slate-700'}`}>
                            {t === 'basic' && '基本'}
                            {t === 'docs' && '文件'}
                            {t === 'timeline' && 'Timeline'}
                            {t === 'jira' && 'Jira'}
                            {t === 'runs' && 'Runs / Cases'}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
                    <div className="p-6 overflow-y-auto flex-1 space-y-4">
                        {metaTab === 'basic' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Title <span className="text-rose-500">*</span></label>
                                    <input type="text" required value={title} onChange={e => setTitle(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                                        placeholder="Plan title" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                                    <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-none"
                                        placeholder="Optional description" />
                                </div>
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
                            </>
                        )}

                        {metaTab === 'docs' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">PRD（單一連結）</label>
                                    <input type="url" value={prdUrl} onChange={e => setPrdUrl(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                                        placeholder="https://confluence.../prd" />
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="block text-sm font-medium text-slate-700">SA / SD（可多份）</label>
                                        <button type="button" onClick={() => addDocEntry('sa')}
                                            className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
                                            <Plus className="w-3 h-3" /> 新增
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {saDocs.map((d, i) => (
                                            <div key={i} className="flex gap-2 items-center">
                                                <input type="text" placeholder="標題（選填）" value={d.title || ''} onChange={e => updateDocEntry('sa', i, 'title', e.target.value)}
                                                    className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                                                <input type="url" placeholder="URL" value={d.url} onChange={e => updateDocEntry('sa', i, 'url', e.target.value)}
                                                    className="flex-[2] min-w-0 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                                                <button type="button" onClick={() => removeDocEntry('sa', i)} className="p-2 text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="block text-sm font-medium text-slate-700">UED（可多份）</label>
                                        <button type="button" onClick={() => addDocEntry('ued')}
                                            className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
                                            <Plus className="w-3 h-3" /> 新增
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {uedDocs.map((d, i) => (
                                            <div key={i} className="flex gap-2 items-center">
                                                <input type="text" placeholder="標題（選填）" value={d.title || ''} onChange={e => updateDocEntry('ued', i, 'title', e.target.value)}
                                                    className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                                                <input type="url" placeholder="URL" value={d.url} onChange={e => updateDocEntry('ued', i, 'url', e.target.value)}
                                                    className="flex-[2] min-w-0 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                                                <button type="button" onClick={() => removeDocEntry('ued', i)} className="p-2 text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="block text-sm font-medium text-slate-700">QA (可多份)</label>
                                        <button type="button" onClick={() => addDocEntry('qa')}
                                            className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
                                            <Plus className="w-3 h-3" /> 新增
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {qaDocs.map((d, i) => (
                                            <div key={i} className="flex gap-2 items-center">
                                                <input type="text" placeholder="標題（選填）" value={d.title || ''} onChange={e => updateDocEntry('qa', i, 'title', e.target.value)}
                                                    className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                                                <input type="url" placeholder="URL" value={d.url} onChange={e => updateDocEntry('qa', i, 'url', e.target.value)}
                                                    className="flex-[2] min-w-0 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                                                <button type="button" onClick={() => removeDocEntry('qa', i)} className="p-2 text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Case Mindmap（連結或上傳檔案）</label>
                                    <div className="flex gap-2 items-center">
                                        <input type="text" value={mindmapUrl} onChange={e => setMindmapUrl(e.target.value)}
                                            className="flex-1 w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                                            placeholder="https://... 或點擊右側圖示上傳檔案" />
                                        <input type="file" id="mindmap-upload" className="hidden" accept=".xmind"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                const formData = new FormData();
                                                formData.append('file', file);
                                                try {
                                                    const res = await api.post('/uploads/', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                                                    setMindmapUrl(res.data.url);
                                                } catch (err) {
                                                    console.error(err);
                                                    alert('上傳失敗');
                                                }
                                            }}
                                        />
                                        <button type="button" onClick={() => document.getElementById('mindmap-upload')?.click()} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500 shrink-0 h-[38px] flex items-center justify-center transition-colors" title="上傳檔案">
                                            <UploadCloud className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

                        {metaTab === 'timeline' && (
                            <>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">RD 開發</label>
                                        <div className="flex gap-2 items-center">
                                            <input type="date" value={timeline.rd?.start || ''} onChange={e => setTimeline({ ...timeline, rd: { ...timeline.rd, start: e.target.value, end: timeline.rd?.end || '' } })}
                                                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                                            <span className="text-slate-400">～</span>
                                            <input type="date" value={timeline.rd?.end || ''} onChange={e => setTimeline({ ...timeline, rd: { ...timeline.rd, start: timeline.rd?.start || '', end: e.target.value } })}
                                                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">UED 設計審核</label>
                                        <div className="flex gap-2 items-center">
                                            <input type="date" value={timeline.ued?.start || ''} onChange={e => setTimeline({ ...timeline, ued: { ...timeline.ued, start: e.target.value, end: timeline.ued?.end || '' } })}
                                                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                                            <span className="text-slate-400">～</span>
                                            <input type="date" value={timeline.ued?.end || ''} onChange={e => setTimeline({ ...timeline, ued: { ...timeline.ued, start: timeline.ued?.start || '', end: e.target.value } })}
                                                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="block text-sm font-medium text-slate-700">QA 交付（APP / PC / M）</label>
                                        <button type="button" onClick={addQaEntry}
                                            className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
                                            <Plus className="w-3 h-3" /> 新增
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {(timeline.qa || []).map((q, i) => (
                                            <div key={i} className="flex gap-2 items-center">
                                                <select value={q.platform} onChange={e => updateQaEntry(i, 'platform', e.target.value)}
                                                    className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                                                    {['APP', 'PC', 'M'].map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                                <input type="date" value={q.start} onChange={e => updateQaEntry(i, 'start', e.target.value)}
                                                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                                                <span className="text-slate-400">～</span>
                                                <input type="date" value={q.end} onChange={e => updateQaEntry(i, 'end', e.target.value)}
                                                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                                                <button type="button" onClick={() => removeQaEntry(i)} className="p-2 text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {metaTab === 'jira' && (
                            <>
                                <p className="text-xs text-slate-500">從 <a href="https://kkday.atlassian.net/issues/?filter=18523" target="_blank" rel="noreferrer" className="text-primary-600 underline">Jira Filter</a> 複製 filter ID（網址 ?filter= 後的數字）</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Unfix Filter ID（未修復 bug）</label>
                                        <input type="number" min={1} value={jiraUnfixFilterId} onChange={e => setJiraUnfixFilterId(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                            placeholder="18523" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Total Filter ID（全部 issues）</label>
                                        <input type="number" min={1} value={jiraTotalFilterId} onChange={e => setJiraTotalFilterId(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                            placeholder="18522" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">顯示欄位（至少選 key/summary/status/assignee/priority）</label>
                                    <div className="flex flex-wrap gap-2">
                                        {JIRA_FIELD_OPTIONS.map(f => (
                                            <label key={f} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                                                <input type="checkbox" checked={jiraDisplayFields.includes(f)} onChange={() => toggleJiraField(f)}
                                                    className="w-4 h-4 rounded border-slate-300 text-primary-600" />
                                                <span className="text-sm">{f}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {metaTab === 'runs' && (
                            <>
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
                                            {caseFolders.length > 0 && (
                                                <div className="mb-3">
                                                    <select value={caseFolderFilter} onChange={e => setCaseFolderFilter(e.target.value)}
                                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                                                        <option value="">All Folders</option>
                                                        {caseFolders.map(f => (
                                                            <option key={f.id} value={String(f.id)}>{f.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
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
                            </>
                        )}
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
