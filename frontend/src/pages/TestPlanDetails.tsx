import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, ClipboardList, PlayCircle, FileText, CheckCircle2, XCircle, Clock, Edit2, ExternalLink, Bug, ListChecks } from 'lucide-react';
import api from '../lib/api';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import EditPlanModal, { CaseFolder } from '../components/plans/EditPlanModal';

interface DocEntry {
    title?: string;
    url: string;
}

interface TestPlan {
    id: number;
    title: string;
    description: string;
    status: string;
    folder_id: number | null;
    run_ids: number[];
    case_ids: number[];
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
    jira_chart_filter_id?: number | null;
    jira_chart_field?: string | null;
    created_at: string;
}

interface JiraIssue {
    key: string;
    url: string;
    summary?: string;
    status?: string;
    assignee?: string;
    priority?: string;
    created?: string;
    labels?: string[];
    team?: string[];
}

interface RunResult {
    id: number;
    title: string;
    status: string;
    passed: number;
    failed: number;
    untested: number;
}

interface CaseResult {
    id: number;
    title: string;
    priority: string;
    status: string;
    suite_id: number;
}

const STATUS_PILL: Record<string, string> = {
    Draft: 'bg-amber-50 text-amber-700 border-amber-200',
    Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Completed: 'bg-blue-50 text-blue-700 border-blue-200',
    Archived: 'bg-slate-50 text-slate-500 border-slate-200',
    Done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Testing: 'bg-amber-50 text-amber-700 border-amber-200',
    Pending: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function TestPlanDetails() {
    const { planId } = useParams();
    const [plan, setPlan] = useState<TestPlan | null>(null);
    const [runs, setRuns] = useState<RunResult[]>([]);
    const [cases, setCases] = useState<CaseResult[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'runs' | 'cases'>('runs');

    // Edit modal
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [folders, setFolders] = useState<any[]>([]);
    const [allRuns, setAllRuns] = useState<any[]>([]);
    const [allCases, setAllCases] = useState<any[]>([]);
    const [allSuites, setAllSuites] = useState<CaseFolder[]>([]);

    // Jira issues
    const [jiraUnfix, setJiraUnfix] = useState<{ issues: JiraIssue[]; view_url?: string } | null>(null);
    const [jiraTotal, setJiraTotal] = useState<{ issues: JiraIssue[]; view_url?: string } | null>(null);
    const [jiraLoading, setJiraLoading] = useState(false);
    const [jiraError, setJiraError] = useState<string | null>(null);

    // Jira table pagination (8 rows/page)
    const JIRA_PAGE_SIZE = 8;
    const [unfixPage, setUnfixPage] = useState(1);
    const [totalPage, setTotalPage] = useState(1);

    // Jira Pie Chart State
    const [jiraChartIssues, setJiraChartIssues] = useState<JiraIssue[]>([]);
    const [jiraChartLoading, setJiraChartLoading] = useState(false);
    const [jiraChartError, setJiraChartError] = useState<string | null>(null);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            // All 4 independent; fetch in parallel
            const [planRes, foldersRes, runsRes, casesRes, suitesRes] = await Promise.all([
                api.get(`/plans/${planId}`),
                api.get(`/plan-folders/project/1`),
                api.get(`/runs/project/1`),
                api.get(`/cases/project/1`),
                api.get(`/suites/project/1`),
            ]);
            const planData: TestPlan = planRes.data;
            setPlan(planData);

            setFolders(foldersRes.data);
            setAllRuns(runsRes.data);
            setAllCases(casesRes.data);
            setAllSuites(suitesRes.data.map((s: any) => ({ id: s.id, name: s.name })));

            if (planData.run_ids?.length) {
                const linkedRuns = (runsRes.data as any[])
                    .filter(r => planData.run_ids!.includes(r.id))
                    .map(r => ({
                        ...r,
                        passed: r.passed ?? 0,
                        failed: r.failed ?? 0,
                        untested: r.untested ?? r.unt ?? 0,
                    }));
                setRuns(linkedRuns);
            } else {
                setRuns([]);
            }

            if (planData.case_ids?.length) {
                const linkedCases = (casesRes.data as any[])
                    .filter(c => planData.case_ids!.includes(c.id));
                setCases(linkedCases);
            } else {
                setCases([]);
            }
        } catch (err) {
            console.error('Failed to load plan details', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (planId) fetchData();
    }, [planId]);

    // Fetch Jira issues when plan has filter IDs
    useEffect(() => {
        if (!plan?.id) return;
        const unfixId = plan.jira_unfix_filter_id;
        const totalId = plan.jira_total_filter_id;
        if (!unfixId && !totalId) {
            setJiraUnfix(null);
            setJiraTotal(null);
            return;
        }
        const load = async () => {
            setJiraLoading(true);
            setJiraError(null);
            try {
                const [unfixRes, totalRes] = await Promise.all([
                    unfixId ? api.get(`/plans/${plan.id}/jira-issues`, { params: { filter_type: 'unfix' } }) : Promise.resolve(null),
                    totalId ? api.get(`/plans/${plan.id}/jira-issues`, { params: { filter_type: 'total' } }) : Promise.resolve(null),
                ]);
                setJiraUnfix(unfixRes?.data?.issues ? { issues: unfixRes.data.issues, view_url: unfixRes.data.view_url } : null);
                setJiraTotal(totalRes?.data?.issues ? { issues: totalRes.data.issues, view_url: totalRes.data.view_url } : null);
            } catch (err: any) {
                console.error("Jira fetch error:", err);
                const msg = err.response?.data?.detail || err.message || "Failed to fetch Jira issues.";
                setJiraError(msg);
                setJiraUnfix(null);
                setJiraTotal(null);
            } finally {
                setJiraLoading(false);
            }
        };
        load();
    }, [plan?.id, plan?.jira_unfix_filter_id, plan?.jira_total_filter_id]);

    // Fetch Jira Pie Chart Issues
    useEffect(() => {
        if (!plan?.jira_chart_filter_id) {
            setJiraChartIssues([]);
            setJiraChartError(null);
            return;
        }
        const loadChart = async () => {
            setJiraChartLoading(true);
            setJiraChartError(null);
            try {
                // Determine the requested field to ensure we ask the backend for it
                // 'team' is custom field, others are standard. The backend endpoint ?fields=... 
                // tells Jira what to return.
                const f = plan.jira_chart_field || 'status';
                const fieldsParam = ['status', 'priority', 'assignee', 'team'].includes(f) ? f : 'status,priority,assignee,team';

                const res = await api.get(`/plans/jira/filter/${plan.jira_chart_filter_id}/issues`, { params: { fields: fieldsParam } });
                setJiraChartIssues(res.data.issues || []);
            } catch (err: any) {
                setJiraChartError(err.response?.data?.detail || err.message || 'Failed to fetch chart issues');
                setJiraChartIssues([]);
            } finally {
                setJiraChartLoading(false);
            }
        };
        loadChart();
    }, [plan?.id, plan?.jira_chart_filter_id, plan?.jira_chart_field]);

    if (isLoading) return (
        <div className="flex-1 flex items-center justify-center bg-slate-50">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
    );

    if (!plan) return <div className="p-8 text-center text-slate-500">Test Plan not found.</div>;

    // ── Aggregations ──────────────────────────────────────────────────────────
    const totalRuns = runs.length;
    const completedRuns = runs.filter(r => r.status === 'Done').length;
    let totalPassed = 0, totalFailed = 0, totalUntested = 0;
    runs.forEach(r => { totalPassed += r.passed; totalFailed += r.failed; totalUntested += r.untested; });
    const totalCaseExecs = totalPassed + totalFailed + totalUntested;
    const passRate = totalCaseExecs > 0 ? Math.round((totalPassed / totalCaseExecs) * 100) : 0;
    const completionRate = totalRuns > 0 ? Math.round((completedRuns / totalRuns) * 100) : 0;

    const pieData = [
        { name: 'Passed', value: totalPassed, color: '#10b981' }, // emarald-500
        { name: 'Failed', value: totalFailed, color: '#f43f5e' }, // rose-500
        { name: 'Untested', value: totalUntested, color: '#94a3b8' }, // slate-400
    ];

    const priorityColor: Record<string, string> = {
        High: 'text-red-600 bg-red-50 border-red-200',
        Medium: 'text-amber-600 bg-amber-50 border-amber-200',
        Low: 'text-slate-500 bg-slate-50 border-slate-200',
    };

    const resolveUrl = (url: string) => {
        if (!url) return url;
        // Already an absolute URL — return as-is
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        // For relative backend paths like /api/v1/uploads/static/...
        // Replace the /api/v1 prefix with whatever VITE_API_URL is set to
        // (e.g. /tcms/api/v1 in production, /api/v1 in dev)
        const apiBase = import.meta.env.VITE_API_URL || '/api/v1';
        // apiBase might be e.g. "/tcms/api/v1" or "/api/v1"
        // strip trailing slash
        const cleanApiBase = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
        // If the stored URL starts with "/api/v1/", replace that prefix with the configured base
        if (url.startsWith('/api/v1/')) {
            return cleanApiBase + url.slice('/api/v1'.length);
        }
        return url;
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-y-auto w-full">

            {/* ── Header ──────────────────────────────────────────────────────── */}
            <div className="px-8 py-6 border-b border-slate-200 bg-white shadow-sm shrink-0">
                <div className="flex items-center gap-4 mb-1">
                    <Link to="/plans" className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                        <ClipboardList className="w-5 h-5 text-teal-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-3xl font-extrabold text-slate-900 flex-1 truncate tracking-tight">{plan.title}</h1>
                        <p className="text-base text-slate-500 mt-1">{plan.description || 'No description provided.'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold border ${STATUS_PILL[plan.status] ?? STATUS_PILL.Draft}`}>
                            {plan.status}
                        </span>
                        <button
                            onClick={() => setIsEditModalOpen(true)}
                            className="p-1.5 rounded-md text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            title="Edit test plan"
                        >
                            <Edit2 className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="p-8 space-y-6 pb-20">

                {/* ── Documents & Timeline ────────────────────────────────────── */}
                {(plan.prd_url || (plan.sa_docs && plan.sa_docs.length) || (plan.sd_docs && plan.sd_docs.length) || (plan.ued_docs && plan.ued_docs.length) || (plan.qa_docs && plan.qa_docs.length) || plan.mindmap_url || plan.timeline) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Documents */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 h-full flex flex-col">
                            <h3 className="text-base font-bold text-slate-700 uppercase tracking-wider mb-6 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-slate-400" /> 文件連結
                            </h3>
                            <div className="space-y-4 flex-1">
                                {plan.prd_url && (
                                    <div className="flex flex-col gap-1 rounded-lg bg-slate-50 p-3 border border-slate-100">
                                        <span className="text-sm font-semibold text-slate-500">PRD</span>
                                        <a href={resolveUrl(plan.prd_url)} target="_blank" rel="noreferrer" className="text-base font-medium text-primary-600 hover:text-primary-700 hover:underline truncate">
                                            {plan.prd_url}
                                        </a>
                                    </div>
                                )}
                                {((plan.sa_docs && plan.sa_docs.length > 0) || (plan.sd_docs && plan.sd_docs.length > 0)) && (
                                    <div className="flex flex-col gap-1 rounded-lg bg-slate-50 p-3 border border-slate-100">
                                        <span className="text-sm font-semibold text-slate-500">SA / SD</span>
                                        <div className="space-y-1.5 mt-1">
                                            {[...(plan.sa_docs || []), ...(plan.sd_docs || [])].map((d, i) => (
                                                <a key={i} href={resolveUrl(d.url)} target="_blank" rel="noreferrer" className="flex items-center gap-2 group">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-primary-400 group-hover:scale-125 transition-transform" />
                                                    <span className="text-base text-slate-700 group-hover:text-primary-600 transition-colors truncate">
                                                        {d.title || d.url}
                                                    </span>
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {plan.ued_docs && plan.ued_docs.length > 0 && (
                                    <div className="flex flex-col gap-1 rounded-lg bg-slate-50 p-3 border border-slate-100">
                                        <span className="text-sm font-semibold text-slate-500">UED</span>
                                        <div className="space-y-1.5 mt-1">
                                            {plan.ued_docs.map((d, i) => (
                                                <a key={i} href={resolveUrl(d.url)} target="_blank" rel="noreferrer" className="flex items-center gap-2 group">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 group-hover:scale-125 transition-transform" />
                                                    <span className="text-base text-slate-700 group-hover:text-indigo-600 transition-colors truncate">
                                                        {d.title || d.url}
                                                    </span>
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {plan.qa_docs && plan.qa_docs.length > 0 && (
                                    <div className="flex flex-col gap-1 rounded-lg bg-slate-50 p-3 border border-slate-100">
                                        <span className="text-sm font-semibold text-slate-500">QA</span>
                                        <div className="space-y-1.5 mt-1">
                                            {plan.qa_docs.map((d, i) => (
                                                <a key={i} href={resolveUrl(d.url)} target="_blank" rel="noreferrer" className="flex items-center gap-2 group">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 group-hover:scale-125 transition-transform" />
                                                    <span className="text-base text-slate-700 group-hover:text-emerald-600 transition-colors truncate">
                                                        {d.title || d.url}
                                                    </span>
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {plan.mindmap_url && (
                                    <div className="flex flex-col gap-1 rounded-lg bg-slate-50 p-3 border border-slate-100">
                                        <span className="text-sm font-semibold text-slate-500">Case Mindmap</span>
                                        <a href={resolveUrl(plan.mindmap_url)} target="_blank" rel="noreferrer" className="text-base font-medium text-amber-600 hover:text-amber-700 hover:underline truncate">
                                            {plan.mindmap_url}
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Timeline */}
                        {plan.timeline && (
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 h-full flex flex-col">
                                <h3 className="text-base font-bold text-slate-700 uppercase tracking-wider mb-6 flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-slate-400" /> 專案時程 (Timeline)
                                </h3>
                                <div className="relative pl-6 space-y-6 flex-1 before:absolute before:inset-y-0 before:left-[11px] before:w-[2px] before:bg-slate-100">
                                    {plan.timeline.rd && (plan.timeline.rd.start || plan.timeline.rd.end) && (
                                        <div className="relative">
                                            <div className="absolute -left-[30px] top-1 w-[14px] h-[14px] rounded-full ring-4 ring-white bg-blue-500 z-10" />
                                            <div>
                                                <h4 className="text-sm font-bold text-slate-700 mb-1.5 uppercase tracking-wide">RD 開發</h4>
                                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-50 text-blue-700 text-base font-medium border border-blue-100">
                                                    {plan.timeline.rd.start || '未定'} → {plan.timeline.rd.end || '未定'}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {plan.timeline.ued && (plan.timeline.ued.start || plan.timeline.ued.end) && (
                                        <div className="relative">
                                            <div className="absolute -left-[30px] top-1 w-[14px] h-[14px] rounded-full ring-4 ring-white bg-indigo-500 z-10" />
                                            <div>
                                                <h4 className="text-sm font-bold text-slate-700 mb-1.5 uppercase tracking-wide">UED 審核</h4>
                                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-indigo-50 text-indigo-700 text-base font-medium border border-indigo-100">
                                                    {plan.timeline.ued.start || '未定'} → {plan.timeline.ued.end || '未定'}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {plan.timeline.qa && plan.timeline.qa.length > 0 && (
                                        <div className="relative">
                                            <div className="absolute -left-[30px] top-1 w-[14px] h-[14px] rounded-full ring-4 ring-white bg-emerald-500 z-10" />
                                            <div className="pb-1">
                                                <h4 className="text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">QA 交付</h4>
                                                <div className="flex flex-col gap-2">
                                                    {plan.timeline.qa.map((q, i) => (
                                                        <div key={i} className="flex flex-col gap-1.5 p-3 rounded-lg border border-emerald-100 bg-emerald-50/50">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded uppercase tracking-wider">{q.platform}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-base font-medium text-emerald-700">
                                                                <Clock className="w-4 h-4 opacity-60" />
                                                                {q.start || '未定'} → {q.end || '未定'}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Metrics ─────────────────────────────────────────────────── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Pass Rate', value: `${passRate}%`, icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" /> },
                        { label: 'Completion Rate', value: `${completionRate}%`, icon: <Clock className="w-5 h-5 text-blue-500" /> },
                        { label: 'Test Runs', value: totalRuns, icon: <PlayCircle className="w-5 h-5 text-primary-500" /> },
                        { label: 'Test Cases', value: cases.length, icon: <FileText className="w-5 h-5 text-slate-400" /> },
                    ].map(m => (
                        <div key={m.label} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                            <div>{m.icon}</div>
                            <div>
                                <p className="text-sm font-semibold text-slate-500 mb-1">{m.label}</p>
                                <p className="text-3xl font-extrabold tracking-tight text-slate-900">{m.value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Chart + Tabs ─────────────────────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Pie chart */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <h3 className="text-base font-bold text-slate-700 uppercase tracking-wider mb-4">Result Distribution</h3>
                        {totalCaseExecs > 0 ? (
                            <>
                                <div className="h-56">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={72} paddingAngle={4} dataKey="value">
                                                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                            </Pie>
                                            <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                            <Legend verticalAlign="bottom" height={32} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="mt-4 flex items-center justify-center gap-8 text-base">
                                    <span className="text-emerald-600 font-bold">Passed: {totalPassed}</span>
                                    <span className="text-rose-500 font-bold">Failed: {totalFailed}</span>
                                    <span className="text-slate-500 font-bold">Total: {totalCaseExecs}</span>
                                </div>
                            </>
                        ) : (
                            <div className="h-56 flex flex-col items-center justify-center text-slate-400">
                                <XCircle className="w-10 h-10 mb-2 text-slate-200" />
                                <p className="text-sm">No result data yet</p>
                            </div>
                        )}
                    </div>

                    {/* Tabbed list */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden lg:col-span-2 flex flex-col">
                        {/* Tab header */}
                        <div className="flex border-b border-slate-200 bg-slate-50/50 shrink-0">
                            <button onClick={() => setActiveTab('runs')}
                                className={`flex items-center gap-2 px-6 py-4 text-base font-semibold border-b-2 transition-colors ${activeTab === 'runs' ? 'border-primary-500 text-primary-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                                <PlayCircle className="w-5 h-5" />
                                Test Runs
                                <span className="text-sm bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5">{totalRuns}</span>
                            </button>
                            <button onClick={() => setActiveTab('cases')}
                                className={`flex items-center gap-2 px-6 py-4 text-base font-semibold border-b-2 transition-colors ${activeTab === 'cases' ? 'border-primary-500 text-primary-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                                <FileText className="w-5 h-5" />
                                Test Cases
                                <span className="text-sm bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5">{cases.length}</span>
                            </button>
                        </div>

                        {/* Runs tab */}
                        {activeTab === 'runs' && (
                            <div className="flex-1 overflow-y-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-white">
                                            <th className="px-6 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Run Title</th>
                                            <th className="px-6 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Progress</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {runs.length === 0 ? (
                                            <tr><td colSpan={3} className="px-6 py-10 text-center text-sm text-slate-400">No test runs linked.</td></tr>
                                        ) : runs.map(run => {
                                            const total = run.passed + run.failed + run.untested;
                                            const pct = total > 0 ? Math.round((run.passed / total) * 100) : 0;
                                            return (
                                                <tr key={run.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <Link to={`/runs/${run.id}`} className="text-base font-semibold text-slate-900 hover:text-primary-600 transition-colors">
                                                            {run.title}
                                                        </Link>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_PILL[run.status] ?? STATUS_PILL.Pending}`}>
                                                            {run.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                                <div style={{ width: `${pct}%` }} className="bg-emerald-500 h-full" />
                                                            </div>
                                                            <span className="text-xs font-medium text-slate-500 tabular-nums">{pct}%</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Cases tab */}
                        {activeTab === 'cases' && (
                            <div className="flex-1 overflow-y-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-white">
                                            <th className="px-6 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Case Title</th>
                                            <th className="px-6 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Priority</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {cases.length === 0 ? (
                                            <tr><td colSpan={2} className="px-6 py-10 text-center text-sm text-slate-400">No test cases linked.</td></tr>
                                        ) : cases.map(tc => (
                                            <tr key={tc.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4 text-base font-medium text-slate-900">{tc.title}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${priorityColor[tc.priority] ?? priorityColor.Low}`}>
                                                        {tc.priority || 'Low'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Jira Bug List ─────────────────────────────────────────────── */}
                {
                    (plan.jira_unfix_filter_id || plan.jira_total_filter_id) && (
                        <div className="space-y-6">
                            <h3 className="text-base font-bold text-slate-700 uppercase tracking-wider">Jira Issues</h3>
                            <div className="flex flex-col gap-6 mt-6">
                                {plan.jira_unfix_filter_id && (
                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
                                        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white">
                                            <span className="text-base font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                                <Bug className="w-5 h-5 text-rose-400" /> Unfix Bugs
                                            </span>
                                            {jiraUnfix?.view_url && (
                                                <a href={jiraUnfix.view_url} target="_blank" rel="noreferrer" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
                                                    <ExternalLink className="w-4 h-4" /> 在 Jira 開啟
                                                </a>
                                            )}
                                        </div>
                                        <div className="overflow-x-auto">
                                            {jiraLoading ? (
                                                <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>
                                            ) : jiraError ? (
                                                <div className="p-6 text-center text-red-500 font-medium bg-red-50 text-sm">
                                                    無資料或 Jira API 未設定<br />
                                                    <span className="text-xs text-red-400 mt-1 block">錯誤: {jiraError}</span>
                                                </div>
                                            ) : jiraUnfix && jiraUnfix.issues.length > 0 ? (() => {
                                                const total = jiraUnfix.issues.length;
                                                const totalPages = Math.ceil(total / JIRA_PAGE_SIZE);
                                                const start = (unfixPage - 1) * JIRA_PAGE_SIZE;
                                                const pageItems = jiraUnfix.issues.slice(start, start + JIRA_PAGE_SIZE);
                                                return (
                                                    <>
                                                        <table className="w-full text-left">
                                                            <thead>
                                                                <tr className="border-b border-slate-200 bg-white">
                                                                    <th className="px-5 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Key</th>
                                                                    <th className="px-5 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Summary</th>
                                                                    <th className="px-5 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Status</th>
                                                                    <th className="px-5 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Assignee</th>
                                                                    <th className="px-5 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Priority</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {pageItems.map((issue, i) => (
                                                                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                                                                        <td className="px-5 py-4"><a href={issue.url} target="_blank" rel="noreferrer" className="text-base text-primary-600 hover:underline font-mono">{issue.key}</a></td>
                                                                        <td className="px-5 py-4 text-base text-slate-800 truncate max-w-[180px]" title={issue.summary}>{issue.summary ?? '—'}</td>
                                                                        <td className="px-5 py-4 text-base text-slate-600">{issue.status ?? '—'}</td>
                                                                        <td className="px-5 py-4 text-base text-slate-600">{issue.assignee ?? '—'}</td>
                                                                        <td className="px-5 py-4 text-base text-slate-600">{issue.priority ?? '—'}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                        {totalPages > 1 && (
                                                            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 text-sm text-slate-500">
                                                                <span>{start + 1}–{Math.min(start + JIRA_PAGE_SIZE, total)} / {total}</span>
                                                                <div className="flex items-center gap-1">
                                                                    <button onClick={() => setUnfixPage(p => Math.max(1, p - 1))} disabled={unfixPage === 1}
                                                                        className="px-2 py-1 rounded hover:bg-slate-200 disabled:opacity-40">‹</button>
                                                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                                                                        <button key={p} onClick={() => setUnfixPage(p)}
                                                                            className={`px-2 py-1 rounded ${p === unfixPage ? 'bg-primary-100 text-primary-700 font-bold' : 'hover:bg-slate-200'}`}>{p}</button>
                                                                    ))}
                                                                    <button onClick={() => setUnfixPage(p => Math.min(totalPages, p + 1))} disabled={unfixPage === totalPages}
                                                                        className="px-2 py-1 rounded hover:bg-slate-200 disabled:opacity-40">›</button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })() : (
                                                <div className="p-6 text-center text-slate-400 text-sm">無資料或 Jira API 未設定</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {plan.jira_total_filter_id && (
                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
                                        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white">
                                            <span className="text-base font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                                <ListChecks className="w-5 h-5 text-blue-400" /> Total Issues
                                            </span>
                                            {jiraTotal?.view_url && (
                                                <a href={jiraTotal.view_url} target="_blank" rel="noreferrer" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
                                                    <ExternalLink className="w-4 h-4" /> 在 Jira 開啟
                                                </a>
                                            )}
                                        </div>
                                        <div className="overflow-x-auto">
                                            {jiraLoading ? (
                                                <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>
                                            ) : jiraError ? (
                                                <div className="p-6 text-center text-red-500 font-medium bg-red-50 text-sm">
                                                    無資料或 Jira API 未設定<br />
                                                    <span className="text-xs text-red-400 mt-1 block">錯誤: {jiraError}</span>
                                                </div>
                                            ) : jiraTotal && jiraTotal.issues.length > 0 ? (() => {
                                                const total = jiraTotal.issues.length;
                                                const totalPages = Math.ceil(total / JIRA_PAGE_SIZE);
                                                const start = (totalPage - 1) * JIRA_PAGE_SIZE;
                                                const pageItems = jiraTotal.issues.slice(start, start + JIRA_PAGE_SIZE);
                                                return (
                                                    <>
                                                        <table className="w-full text-left">
                                                            <thead>
                                                                <tr className="border-b border-slate-200 bg-white">
                                                                    <th className="px-5 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Key</th>
                                                                    <th className="px-5 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Summary</th>
                                                                    <th className="px-5 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Status</th>
                                                                    <th className="px-5 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Assignee</th>
                                                                    <th className="px-5 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Priority</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {pageItems.map((issue, i) => (
                                                                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                                                                        <td className="px-5 py-4"><a href={issue.url} target="_blank" rel="noreferrer" className="text-base text-primary-600 hover:underline font-mono">{issue.key}</a></td>
                                                                        <td className="px-5 py-4 text-base text-slate-800 truncate max-w-[180px]" title={issue.summary}>{issue.summary ?? '—'}</td>
                                                                        <td className="px-5 py-4 text-base text-slate-600">{issue.status ?? '—'}</td>
                                                                        <td className="px-5 py-4 text-base text-slate-600">{issue.assignee ?? '—'}</td>
                                                                        <td className="px-5 py-4 text-base text-slate-600">{issue.priority ?? '—'}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                        {totalPages > 1 && (
                                                            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 text-sm text-slate-500">
                                                                <span>{start + 1}–{Math.min(start + JIRA_PAGE_SIZE, total)} / {total}</span>
                                                                <div className="flex items-center gap-1">
                                                                    <button onClick={() => setTotalPage(p => Math.max(1, p - 1))} disabled={totalPage === 1}
                                                                        className="px-2 py-1 rounded hover:bg-slate-200 disabled:opacity-40">‹</button>
                                                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                                                                        <button key={p} onClick={() => setTotalPage(p)}
                                                                            className={`px-2 py-1 rounded ${p === totalPage ? 'bg-primary-100 text-primary-700 font-bold' : 'hover:bg-slate-200'}`}>{p}</button>
                                                                    ))}
                                                                    <button onClick={() => setTotalPage(p => Math.min(totalPages, p + 1))} disabled={totalPage === totalPages}
                                                                        className="px-2 py-1 rounded hover:bg-slate-200 disabled:opacity-40">›</button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })() : (
                                                <div className="p-6 text-center text-slate-400 text-sm">無資料或 Jira API 未設定</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Jira Pie Chart Dashboard View */}
                            {plan.jira_chart_filter_id && (
                                <div className="bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-slate-100 p-6 xl:p-8 mt-6">
                                    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                                        <h4 className="text-base font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                            <span className="inline-block w-3 h-3 rounded-full bg-primary-400" />
                                            Jira 分佈圖
                                        </h4>
                                        <div className="flex items-center gap-4 text-sm text-slate-500">
                                            <span className="flex items-center gap-1.5"><ListChecks className="w-4 h-4 text-slate-400" />依據「{plan.jira_chart_field === 'team' ? '歸屬團隊' : plan.jira_chart_field}」顯示</span>
                                            <a
                                                href={`https://kkday.atlassian.net/issues/?filter=${plan.jira_chart_filter_id}`}
                                                target="_blank" rel="noreferrer"
                                                className="text-primary-600 hover:text-primary-700 hover:underline flex items-center gap-1 font-medium bg-primary-50 px-2 py-1 rounded-md"
                                            >
                                                Filter: {plan.jira_chart_filter_id} <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                        </div>
                                    </div>

                                    {jiraChartLoading ? (
                                        <div className="h-48 flex items-center justify-center">
                                            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                                        </div>
                                    ) : jiraChartError ? (
                                        <div className="py-6 text-center text-red-500 text-sm bg-red-50 rounded-lg">
                                            {jiraChartError}
                                        </div>
                                    ) : jiraChartIssues.length === 0 ? (
                                        <div className="h-48 flex items-center justify-center text-slate-400 text-sm">無資料</div>
                                    ) : (() => {
                                        const counts: Record<string, number> = {};
                                        const f = plan.jira_chart_field || 'status';
                                        jiraChartIssues.forEach((issue: any) => {
                                            const raw = issue[f];
                                            const vals: string[] = Array.isArray(raw)
                                                ? (raw as string[]).length ? raw.map(String) : ['(empty)']
                                                : [(raw as string) || '(unknown)'];
                                            vals.forEach(v => { counts[v] = (counts[v] ?? 0) + 1; });
                                        });
                                        const COLORS = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b'];
                                        const pd = Object.entries(counts)
                                            .sort((a, b) => b[1] - a[1])
                                            .map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }));
                                        return (
                                            <div className="flex flex-col sm:flex-row items-center gap-8">
                                                <div className="w-64 h-64 shrink-0">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <PieChart>
                                                            <Pie data={pd} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                                                                {pd.map((e, i) => <Cell key={i} fill={e.color} />)}
                                                            </Pie>
                                                            <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                </div>
                                                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 w-full">
                                                    {pd.map((e, i) => (
                                                        <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100/60 shadow-sm">
                                                            <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                                                            <span className="text-sm text-slate-700 truncate flex-1 font-medium" title={e.name}>{e.name}</span>
                                                            <span className="text-sm font-bold text-slate-900 tabular-nums shrink-0">{e.value}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                        </div>
                    )
                }
            </div>

            {isEditModalOpen && (
                <EditPlanModal
                    plan={plan}
                    folders={folders}
                    runs={allRuns}
                    cases={allCases}
                    caseFolders={allSuites}
                    onClose={() => setIsEditModalOpen(false)}
                    onSaved={fetchData}
                />
            )}
        </div>
    );
}
