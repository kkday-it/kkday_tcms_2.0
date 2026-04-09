import { useState, useEffect, useRef, useMemo } from 'react';
import { Loader2, Search, Plus, X, UploadCloud, ExternalLink } from 'lucide-react';
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
    parent_suite_id?: number | null;
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
    jira_unfix_filter_ids?: number[] | null;
    jira_total_filter_ids?: number[] | null;
    jira_display_fields?: string[];
    jira_chart_filter_id?: number | null;
    jira_chart_field?: string | null;
}

// ─── Collapsible Suite Tree Selector ────────────────────────────────────────
function SuiteTreeSelect({ value, onChange, folders }: {
    value: string;
    onChange: (v: string) => void;
    folders: CaseFolder[];
}) {
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Pre-build parent → children map to avoid O(n) scans per node
    const childrenMap = useMemo(() => {
        const map = new Map<number, CaseFolder[]>();
        folders.forEach(f => {
            if (f.parent_suite_id != null) {
                const arr = map.get(f.parent_suite_id) ?? [];
                arr.push(f);
                map.set(f.parent_suite_id, arr);
            }
        });
        return map;
    }, [folders]);
    const roots = useMemo(() => folders.filter(f => f.parent_suite_id == null), [folders]);
    const selectedName = value ? folders.find(f => String(f.id) === value)?.name ?? 'All Suites' : 'All Suites';

    const toggle = (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
    };

    const renderNode = (folder: CaseFolder, depth: number): React.ReactNode => {
        const children = childrenMap.get(folder.id) ?? [];
        const isExpanded = expanded.has(folder.id);
        const isSelected = String(folder.id) === value;
        return (
            <div key={folder.id}>
                <div
                    className={`flex items-center gap-1 py-1.5 pr-2 cursor-pointer rounded ${isSelected ? 'bg-primary-100 text-primary-700' : 'hover:bg-primary-50 text-slate-700'}`}
                    style={{ paddingLeft: `${8 + depth * 16}px` }}
                    onClick={() => { onChange(String(folder.id)); setOpen(false); }}
                >
                    {children.length > 0 ? (
                        <span onClick={e => toggle(folder.id, e)}
                            className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-600 shrink-0 text-[10px]">
                            {isExpanded ? '▾' : '▸'}
                        </span>
                    ) : (
                        <span className="w-4 shrink-0" />
                    )}
                    <span className="text-xs truncate">{folder.name}</span>
                </div>
                {isExpanded && children.map(child => renderNode(child, depth + 1))}
            </div>
        );
    };

    return (
        <div ref={ref} className="relative">
            <button type="button" onClick={() => setOpen(o => !o)}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 flex items-center justify-between gap-1">
                <span className="truncate">{selectedName}</span>
                <span className="text-slate-400 shrink-0">▾</span>
            </button>
            {open && (
                <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto mt-1 py-1">
                    <div
                        className={`px-2 py-1.5 cursor-pointer rounded text-xs mx-1 ${!value ? 'bg-primary-100 text-primary-700' : 'hover:bg-primary-50 text-slate-700'}`}
                        onClick={() => { onChange(''); setOpen(false); }}
                    >
                        All Suites
                    </div>
                    {roots.map(root => renderNode(root, 0))}
                </div>
            )}
        </div>
    );
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

    interface TimelineRow {
        platform: string;
        rd_start: string; rd_end: string;
        ued_start: string; ued_end: string;
        qa_start: string; qa_end: string;
    }
    const PLATFORM_PRESETS = ['Android', 'iOS', 'PC', 'M'];
    const emptyRow = (platform = ''): TimelineRow => ({ platform, rd_start: '', rd_end: '', ued_start: '', ued_end: '', qa_start: '', qa_end: '' });
    const [timelineRows, setTimelineRows] = useState<TimelineRow[]>([]);
    const [jiraUnfixFilterId, setJiraUnfixFilterId] = useState<string>('');
    const [jiraTotalFilterId, setJiraTotalFilterId] = useState<string>('');
    const [jiraUnfixFilterIds, setJiraUnfixFilterIds] = useState<number[]>([]);
    const [jiraTotalFilterIds, setJiraTotalFilterIds] = useState<number[]>([]);
    const [jiraUnfixInput, setJiraUnfixInput] = useState<string>('');
    const [jiraTotalInput, setJiraTotalInput] = useState<string>('');
    const [jiraDisplayFields, setJiraDisplayFields] = useState<string[]>(['key', 'summary', 'status', 'assignee', 'priority']);
    const [selectedRunIds, setSelectedRunIds] = useState<number[]>([]);
    const [selectedCaseIds, setSelectedCaseIds] = useState<number[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [caseSearch, setCaseSearch] = useState('');
    const [caseFolderFilter, setCaseFolderFilter] = useState<string>('');
    const [activeTab, setActiveTab] = useState<'runs' | 'cases'>('runs');
    const [metaTab, setMetaTab] = useState<'basic' | 'docs' | 'timeline' | 'jira' | 'runs'>('basic');

    // Jira pie chart (inside modal)
    const [chartFilterInput, setChartFilterInput] = useState('');
    const [chartFilterId, setChartFilterId] = useState('');
    const [chartField, setChartField] = useState<'status' | 'priority' | 'assignee' | 'team'>('status');

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
            const t = plan.timeline || {} as any;
            if (t.rows) {
                setTimelineRows(t.rows);
            } else if (t.qa?.length) {
                // 舊格式轉換：把全域 RD/UED 套到每個 QA platform 上
                setTimelineRows((t.qa as any[]).map((q: any) => ({
                    platform: q.platform,
                    rd_start: t.rd?.start || '', rd_end: t.rd?.end || '',
                    ued_start: t.ued?.start || '', ued_end: t.ued?.end || '',
                    qa_start: q.start || '', qa_end: q.end || '',
                })));
            } else {
                setTimelineRows([]);
            }
            setJiraUnfixFilterId(plan.jira_unfix_filter_id != null ? String(plan.jira_unfix_filter_id) : '');
            setJiraTotalFilterId(plan.jira_total_filter_id != null ? String(plan.jira_total_filter_id) : '');
            setJiraUnfixFilterIds(plan.jira_unfix_filter_ids ?? (plan.jira_unfix_filter_id != null ? [plan.jira_unfix_filter_id] : []));
            setJiraTotalFilterIds(plan.jira_total_filter_ids ?? (plan.jira_total_filter_id != null ? [plan.jira_total_filter_id] : []));
            setJiraDisplayFields(plan.jira_display_fields?.length ? plan.jira_display_fields : ['key', 'summary', 'status', 'assignee', 'priority']);
            setChartFilterId(plan.jira_chart_filter_id != null ? String(plan.jira_chart_filter_id) : '');
            setChartFilterInput(plan.jira_chart_filter_id != null ? String(plan.jira_chart_filter_id) : '');
            setChartField((plan.jira_chart_field as any) || 'status');
            setSelectedRunIds(plan.run_ids || []);
            setSelectedCaseIds(plan.case_ids || []);
        } else {
            setTitle(''); setDescription(''); setStatus('Draft');
            setFolderId(''); setSelectedRunIds([]); setSelectedCaseIds([]);
            setPrdUrl(''); setSaDocs([]); setSdDocs([]);
            setUedDocs([]); setQaDocs([]); setMindmapUrl('');
            setTimelineRows([]);
            setJiraUnfixFilterId(''); setJiraTotalFilterId('');
            setJiraUnfixFilterIds([]); setJiraTotalFilterIds([]);
            setJiraUnfixInput(''); setJiraTotalInput('');
            setJiraDisplayFields(['key', 'summary', 'status', 'assignee', 'priority']);
            setChartFilterId(''); setChartFilterInput(''); setChartField('status');
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

    const addTimelineRow = (platform = '') => setTimelineRows(r => [...r, emptyRow(platform)]);
    const updateTimelineRow = (idx: number, field: keyof ReturnType<typeof emptyRow>, value: string) =>
        setTimelineRows(r => r.map((row, i) => i === idx ? { ...row, [field]: value } : row));
    const removeTimelineRow = (idx: number) => setTimelineRows(r => r.filter((_, i) => i !== idx));

    const toggleJiraField = (f: string) => {
        setJiraDisplayFields(prev =>
            prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f].sort((a, b) => JIRA_FIELD_OPTIONS.indexOf(a) - JIRA_FIELD_OPTIONS.indexOf(b))
        );
    };

    const toggleRun = (id: number) =>
        setSelectedRunIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    const toggleCase = (id: number) =>
        setSelectedCaseIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    // Build set of all descendant suite IDs for the selected suite (for KQT-14713)
    const descendantSuiteIds = (rootId: string): Set<string> => {
        const ids = new Set<string>();
        const visit = (id: string) => {
            if (ids.has(id)) return; // cycle guard
            ids.add(id);
            caseFolders.filter(f => String(f.parent_suite_id) === id).forEach(f => visit(String(f.id)));
        };
        if (rootId) visit(rootId);
        return ids;
    };
    const activeSuiteIds = useMemo(
        () => caseFolderFilter ? descendantSuiteIds(caseFolderFilter) : null,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [caseFolderFilter, caseFolders]
    );

    const filteredCases = cases
        .filter(c => !activeSuiteIds || activeSuiteIds.has(String(c.suite_id)))
        .filter(c => c.title.toLowerCase().includes(caseSearch.toLowerCase()));


    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        setIsSaving(true);
        try {
            const tPayload = timelineRows.length > 0 ? { rows: timelineRows } : null;
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
                jira_unfix_filter_ids: jiraUnfixFilterIds.length > 0 ? jiraUnfixFilterIds : null,
                jira_total_filter_ids: jiraTotalFilterIds.length > 0 ? jiraTotalFilterIds : null,
                jira_display_fields: jiraDisplayFields.length ? jiraDisplayFields : ['key', 'summary', 'status', 'assignee', 'priority'],
                jira_chart_filter_id: chartFilterId.trim() ? parseInt(chartFilterId, 10) : null,
                jira_chart_field: chartField,
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
            <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
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
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs text-slate-500">每個平台各自設定 RD、UED、QA 時程，空白欄位不顯示。</p>
                                    <div className="flex items-center gap-1.5">
                                        {PLATFORM_PRESETS.map(p => (
                                            <button key={p} type="button"
                                                onClick={() => addTimelineRow(p)}
                                                disabled={timelineRows.some(r => r.platform === p)}
                                                className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-lg hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                                + {p}
                                            </button>
                                        ))}
                                        <button type="button" onClick={() => addTimelineRow()}
                                            className="px-2.5 py-1 text-xs font-medium border border-dashed border-slate-300 rounded-lg hover:bg-slate-50 text-slate-500 flex items-center gap-1">
                                            <Plus className="w-3 h-3" /> 自訂
                                        </button>
                                    </div>
                                </div>

                                {timelineRows.length === 0 ? (
                                    <div className="border-2 border-dashed border-slate-200 rounded-xl py-10 text-center text-slate-400 text-sm">
                                        點擊上方按鈕新增平台時程
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                                        <table className="w-full text-sm border-collapse">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-200">
                                                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">平台</th>
                                                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-blue-600 uppercase tracking-wider">RD 開發</th>
                                                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-indigo-600 uppercase tracking-wider">UED 審核</th>
                                                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-emerald-600 uppercase tracking-wider">QA 進測</th>
                                                    <th className="w-8" />
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {timelineRows.map((row, i) => (
                                                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-3 py-2">
                                                            <input value={row.platform} onChange={e => updateTimelineRow(i, 'platform', e.target.value)}
                                                                className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
                                                                placeholder="平台名稱" />
                                                        </td>
                                                        {(['rd', 'ued', 'qa'] as const).map(phase => (
                                                            <td key={phase} className="px-3 py-2">
                                                                <div className="flex items-center gap-1.5">
                                                                    <input type="date"
                                                                        value={row[`${phase}_start`]}
                                                                        onChange={e => updateTimelineRow(i, `${phase}_start`, e.target.value)}
                                                                        className="flex-1 min-w-0 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500" />
                                                                    <span className="text-slate-300 shrink-0">→</span>
                                                                    <input type="date"
                                                                        value={row[`${phase}_end`]}
                                                                        onChange={e => updateTimelineRow(i, `${phase}_end`, e.target.value)}
                                                                        className="flex-1 min-w-0 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500" />
                                                                </div>
                                                            </td>
                                                        ))}
                                                        <td className="px-2 py-2">
                                                            <button type="button" onClick={() => removeTimelineRow(i)}
                                                                className="p-1.5 text-slate-300 hover:text-red-500 rounded transition-colors">
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}

                        {metaTab === 'jira' && (
                            <>
                                <p className="text-xs text-slate-500">從 <a href="https://kkday.atlassian.net/issues/?filter=18523" target="_blank" rel="noreferrer" className="text-primary-600 underline">Jira Filter</a> 複製 filter ID（網址 ?filter= 後的數字）</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Unfix Filter IDs（未修復 bug，可多個）</label>
                                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                                            {jiraUnfixFilterIds.map(id => (
                                                <span key={id} className="flex items-center gap-1 px-2 py-0.5 bg-primary-50 text-primary-700 border border-primary-200 rounded text-xs font-medium">
                                                    {id}
                                                    <button type="button" onClick={() => setJiraUnfixFilterIds(prev => prev.filter(x => x !== id))} className="hover:text-red-500 leading-none">×</button>
                                                </span>
                                            ))}
                                        </div>
                                        <input
                                            type="number" min={1} value={jiraUnfixInput}
                                            onChange={e => setJiraUnfixInput(e.target.value)}
                                            onKeyDown={e => {
                                                if ((e.key === 'Enter' || e.key === ',') && jiraUnfixInput.trim()) {
                                                    e.preventDefault();
                                                    const id = parseInt(jiraUnfixInput.trim(), 10);
                                                    if (!isNaN(id) && !jiraUnfixFilterIds.includes(id)) setJiraUnfixFilterIds(prev => [...prev, id]);
                                                    setJiraUnfixInput('');
                                                }
                                            }}
                                            onBlur={() => {
                                                if (jiraUnfixInput.trim()) {
                                                    const id = parseInt(jiraUnfixInput.trim(), 10);
                                                    if (!isNaN(id) && !jiraUnfixFilterIds.includes(id)) setJiraUnfixFilterIds(prev => [...prev, id]);
                                                    setJiraUnfixInput('');
                                                }
                                            }}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                            placeholder="輸入 ID 後按 Enter" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Total Filter IDs（全部 issues，可多個）</label>
                                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                                            {jiraTotalFilterIds.map(id => (
                                                <span key={id} className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded text-xs font-medium">
                                                    {id}
                                                    <button type="button" onClick={() => setJiraTotalFilterIds(prev => prev.filter(x => x !== id))} className="hover:text-red-500 leading-none">×</button>
                                                </span>
                                            ))}
                                        </div>
                                        <input
                                            type="number" min={1} value={jiraTotalInput}
                                            onChange={e => setJiraTotalInput(e.target.value)}
                                            onKeyDown={e => {
                                                if ((e.key === 'Enter' || e.key === ',') && jiraTotalInput.trim()) {
                                                    e.preventDefault();
                                                    const id = parseInt(jiraTotalInput.trim(), 10);
                                                    if (!isNaN(id) && !jiraTotalFilterIds.includes(id)) setJiraTotalFilterIds(prev => [...prev, id]);
                                                    setJiraTotalInput('');
                                                }
                                            }}
                                            onBlur={() => {
                                                if (jiraTotalInput.trim()) {
                                                    const id = parseInt(jiraTotalInput.trim(), 10);
                                                    if (!isNaN(id) && !jiraTotalFilterIds.includes(id)) setJiraTotalFilterIds(prev => [...prev, id]);
                                                    setJiraTotalInput('');
                                                }
                                            }}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                            placeholder="輸入 ID 後按 Enter" />
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
                                {/* ── Jira Pie Chart ── */}
                                <div className="border-t border-slate-100 pt-4 mt-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                                        <span className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-primary-400" /> Jira 分佈圖
                                        </span>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <form className="flex items-center gap-1.5"
                                                onSubmit={e => { e.preventDefault(); setChartFilterId(chartFilterInput.trim()); }}>
                                                <input type="number" min={1} value={chartFilterInput}
                                                    onChange={e => setChartFilterInput(e.target.value)}
                                                    placeholder="Filter ID…"
                                                    className="w-28 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                                                <button type="submit"
                                                    className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">查詢</button>
                                                {chartFilterId && (
                                                    <a href={`https://kkday.atlassian.net/issues/?filter=${chartFilterId}`}
                                                        target="_blank" rel="noreferrer"
                                                        className="text-primary-600 hover:underline">
                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                    </a>
                                                )}
                                            </form>
                                            <select value={chartField}
                                                onChange={e => setChartField(e.target.value as 'status' | 'priority' | 'assignee' | 'team')}
                                                className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                                                <option value="status">Status</option>
                                                <option value="priority">Priority</option>
                                                <option value="assignee">Assignee</option>
                                                <option value="team">歸屬團隊</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="text-slate-400 text-sm py-4 text-center">
                                        設定 Filter ID 後，圖表將顯示在 Test Plan 詳情頁
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
                                        <div className="flex gap-3 h-80">
                                            {/* ── Left: Available Cases ── */}
                                            <div className="flex-1 flex flex-col min-w-0 border border-slate-200 rounded-xl overflow-hidden">
                                                <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50 shrink-0 space-y-2">
                                                    <SuiteTreeSelect
                                                        value={caseFolderFilter}
                                                        onChange={setCaseFolderFilter}
                                                        folders={caseFolders}
                                                    />
                                                    <div className="relative">
                                                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                                        <input type="text" placeholder="Search cases…" value={caseSearch}
                                                            onChange={e => setCaseSearch(e.target.value)}
                                                            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500" />
                                                    </div>
                                                    <p className="text-[11px] text-slate-400 px-0.5">
                                                        {filteredCases.filter(c => !selectedCaseIds.includes(c.id)).length} 筆可選
                                                    </p>
                                                </div>
                                                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-white">
                                                    {filteredCases.filter(c => !selectedCaseIds.includes(c.id)).length === 0 ? (
                                                        <p className="text-xs text-slate-400 p-4 text-center">No cases found.</p>
                                                    ) : (
                                                        filteredCases.filter(c => !selectedCaseIds.includes(c.id)).map(tc => (
                                                            <button key={tc.id} type="button" onClick={() => toggleCase(tc.id)}
                                                                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-primary-50 text-left transition-colors group">
                                                                <Plus className="w-3.5 h-3.5 text-slate-300 group-hover:text-primary-500 shrink-0 transition-colors" />
                                                                <span className="text-[11px] font-mono text-slate-400 shrink-0 w-10">TC-{tc.id}</span>
                                                                <span className="text-xs text-slate-700 truncate">{tc.title}</span>
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            </div>

                                            {/* ── Right: Selected Cases ── */}
                                            <div className="flex-1 flex flex-col min-w-0 border border-slate-200 rounded-xl overflow-hidden">
                                                <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50 shrink-0 flex items-center justify-between">
                                                    <span className="text-xs font-semibold text-slate-600">
                                                        已選擇 <span className="text-primary-600">{selectedCaseIds.length}</span> 個案例
                                                    </span>
                                                    {selectedCaseIds.length > 0 && (
                                                        <button type="button" onClick={() => setSelectedCaseIds([])}
                                                            className="text-xs text-rose-500 hover:text-rose-700 transition-colors">
                                                            清除全部
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-white">
                                                    {selectedCaseIds.length === 0 ? (
                                                        <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-1.5 py-8">
                                                            <Plus className="w-8 h-8" />
                                                            <p className="text-xs">從左側點擊案例加入</p>
                                                        </div>
                                                    ) : (
                                                        cases.filter(c => selectedCaseIds.includes(c.id)).map(tc => (
                                                            <div key={tc.id} className="flex items-center gap-2 px-3 py-2.5 group hover:bg-slate-50 transition-colors">
                                                                <span className="text-[11px] font-mono text-slate-400 shrink-0 w-10">TC-{tc.id}</span>
                                                                <span className="text-xs text-slate-700 truncate flex-1">{tc.title}</span>
                                                                <button type="button" onClick={() => toggleCase(tc.id)}
                                                                    className="shrink-0 p-0.5 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                                                                    <X className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        </div>
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
