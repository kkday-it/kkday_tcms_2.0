import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, ClipboardList, PlayCircle, FileText, CheckCircle2, XCircle, Clock } from 'lucide-react';
import api from '../lib/api';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';

interface TestPlan {
    id: number;
    title: string;
    description: string;
    status: string;
    folder_id: number | null;
    run_ids: number[];
    case_ids: number[];
    created_at: string;
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

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const planRes = await api.get(`/plans/${planId}`);
            const planData: TestPlan = planRes.data;
            setPlan(planData);

            // Fetch all runs for project, then filter by plan's run_ids
            if (planData.run_ids?.length) {
                const runsRes = await api.get(`/runs/project/1`);
                const linkedRuns = (runsRes.data as any[])
                    .filter(r => planData.run_ids.includes(r.id))
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

            // Fetch linked cases
            if (planData.case_ids?.length) {
                const casesRes = await api.get(`/cases/project/1`);
                const linkedCases = (casesRes.data as any[])
                    .filter(c => planData.case_ids.includes(c.id));
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
        { name: 'Passed', value: totalPassed, color: '#22c55e' },
        { name: 'Failed', value: totalFailed, color: '#ef4444' },
        { name: 'Untested', value: totalUntested, color: '#94a3b8' },
    ];

    const priorityColor: Record<string, string> = {
        High: 'text-red-600 bg-red-50 border-red-200',
        Medium: 'text-amber-600 bg-amber-50 border-amber-200',
        Low: 'text-slate-500 bg-slate-50 border-slate-200',
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
                        <h1 className="text-2xl font-bold text-slate-900 truncate">{plan.title}</h1>
                        <p className="text-sm text-slate-500 mt-0.5">{plan.description || 'No description provided.'}</p>
                    </div>
                    <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold border ${STATUS_PILL[plan.status] ?? STATUS_PILL.Draft}`}>
                        {plan.status}
                    </span>
                </div>
            </div>

            <div className="p-8 space-y-6 pb-20">

                {/* ── Metrics ─────────────────────────────────────────────────── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Pass Rate', value: `${passRate}%`, icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" /> },
                        { label: 'Completion Rate', value: `${completionRate}%`, icon: <Clock className="w-5 h-5 text-blue-500" /> },
                        { label: 'Test Runs', value: totalRuns, icon: <PlayCircle className="w-5 h-5 text-primary-500" /> },
                        { label: 'Test Cases', value: cases.length, icon: <FileText className="w-5 h-5 text-slate-400" /> },
                    ].map(m => (
                        <div key={m.label} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                            <div>{m.icon}</div>
                            <div>
                                <p className="text-xs font-medium text-slate-500">{m.label}</p>
                                <p className="text-2xl font-bold text-slate-900">{m.value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Chart + Tabs ─────────────────────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Pie chart */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">Result Distribution</h3>
                        {totalCaseExecs > 0 ? (
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
                                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'runs' ? 'border-primary-500 text-primary-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                                <PlayCircle className="w-4 h-4" />
                                Test Runs
                                <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{totalRuns}</span>
                            </button>
                            <button onClick={() => setActiveTab('cases')}
                                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'cases' ? 'border-primary-500 text-primary-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                                <FileText className="w-4 h-4" />
                                Test Cases
                                <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{cases.length}</span>
                            </button>
                        </div>

                        {/* Runs tab */}
                        {activeTab === 'runs' && (
                            <div className="flex-1 overflow-y-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-white">
                                            <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Run Title</th>
                                            <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Progress</th>
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
                                                        <Link to={`/runs/${run.id}`} className="text-sm font-semibold text-slate-900 hover:text-primary-600 transition-colors">
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
                                            <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Case Title</th>
                                            <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {cases.length === 0 ? (
                                            <tr><td colSpan={2} className="px-6 py-10 text-center text-sm text-slate-400">No test cases linked.</td></tr>
                                        ) : cases.map(tc => (
                                            <tr key={tc.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4 text-sm font-medium text-slate-900">{tc.title}</td>
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
            </div>
        </div>
    );
}
