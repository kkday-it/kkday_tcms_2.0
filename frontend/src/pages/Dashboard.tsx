import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, PlayCircle, Loader2, Bug, AlertTriangle, CheckCircle2, XCircle, Clock, Zap, Target, Activity, Ban } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import api from '../lib/api';
import { runStatusBadgeClasses } from '../lib/runStatus';

// --- Interfaces: Overview ---
interface SummaryCards {
    total_cases: number;
    active_runs: number;
    total_defects: number;
}
interface RunTypeDistribution {
    name: string;
    value: number;
}
interface RunTypePassFail {
    run_type: string;
    passed: number;
    failed: number;
}
interface RecentRun {
    id: number;
    title: string;
    status: string;
    run_type: string;
    passed: number;
    failed: number;
    blocked: number;
    skipped?: number; // KQT-15524
    untested: number; // Added
    total: number;
}
interface TopFailingCase {
    title: string;
    fail_count: number;
}
interface DashboardSummary {
    summary_cards: SummaryCards;
    run_types_distribution: RunTypeDistribution[];
    run_type_pass_fail: RunTypePassFail[];
    recent_runs: RecentRun[];
    top_failing_cases: TopFailingCase[];
}

// --- Interfaces: My Space ---
interface AssignedRun {
    id: number;
    title: string;
    status: string;
    passed: number;
    failed: number;
    blocked: number;
    untested: number;
    total: number;
}
interface DashboardMetrics {
    cases_owned: number;
    cases_automated: number;
    recent_executions_7d: number;
}
interface MyDashboardData {
    assigned_runs: AssignedRun[];
    metrics: DashboardMetrics;
}

const COLORS = ['#00bcd4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

export default function Dashboard() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'my_space' | 'overview'>('overview');

    // Overview State
    const [overviewData, setOverviewData] = useState<DashboardSummary | null>(null);
    const [isOverviewLoading, setIsOverviewLoading] = useState(true);

    // My Space State
    const [myData, setMyData] = useState<MyDashboardData | null>(null);
    const [isMyDataLoading, setIsMyDataLoading] = useState(true);

    // Read user id from localStorage (set by Google OAuth login)
    const currentUserId = (() => {
        try {
            const user = JSON.parse(localStorage.getItem('tcms_user') || '{}');
            return user?.id || 1;
        } catch {
            return 1;
        }
    })();

    useEffect(() => {
        const fetchOverview = async () => {
            try {
                const response = await api.get('/dashboard/summary');
                setOverviewData(response.data);
            } catch (error) {
                console.error("Failed to fetch overview summary", error);
            } finally {
                setIsOverviewLoading(false);
            }
        };

        const fetchMyData = async () => {
            try {
                const response = await api.get(`/dashboard/me?user_id=${currentUserId}`);
                setMyData(response.data);
            } catch (error) {
                console.error("Failed to fetch my dashboard data", error);
            } finally {
                setIsMyDataLoading(false);
            }
        };

        fetchOverview();
        fetchMyData();
    }, []);

    // --- Render: My Space ---
    const renderMySpace = () => {
        if (isMyDataLoading || !myData) {
            return (
                <div className="flex-1 flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                </div>
            );
        }

        const metrics = myData.metrics;
        const automationRate = metrics.cases_owned > 0 ? Math.round((metrics.cases_automated / metrics.cases_owned) * 100) : 0;

        return (
            <div className="animate-in fade-in duration-300">
                {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    {/* Active Assignments */}
                    <div onClick={() => { }} className="bg-white p-6 rounded-2xl border border-slate-200 flex flex-col hover:border-primary-300 hover:shadow-md transition-all shadow-sm relative overflow-hidden group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Target className="w-20 h-20 text-indigo-600" />
                        </div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                                <Target className="w-5 h-5 text-indigo-600" />
                            </div>
                            <span className="text-slate-600 font-bold tracking-wide uppercase text-xs">指派中的執行</span>
                        </div>
                        <div className="flex items-end gap-2">
                            <span className="text-4xl font-extrabold text-slate-900">{myData.assigned_runs.length}</span>
                            <span className="text-sm text-slate-500 mb-1">待執行</span>
                        </div>
                    </div>

                    {/* My Output */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 flex flex-col hover:border-primary-300 hover:shadow-md transition-all shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Activity className="w-20 h-20 text-emerald-600" />
                        </div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                                <Activity className="w-5 h-5 text-emerald-600" />
                            </div>
                            <span className="text-slate-600 font-bold tracking-wide uppercase text-xs">我的產出（7 天）</span>
                        </div>
                        <div className="flex items-end gap-2">
                            <span className="text-4xl font-extrabold text-slate-900">{metrics.recent_executions_7d}</span>
                            <span className="text-sm text-slate-500 mb-1">已執行測試</span>
                        </div>
                    </div>

                    {/* Automation Coverage */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 flex flex-col hover:border-primary-300 hover:shadow-md transition-all shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Zap className="w-20 h-20 text-amber-500" />
                        </div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                                <Zap className="w-5 h-5 text-amber-600" />
                            </div>
                            <span className="text-slate-600 font-bold tracking-wide uppercase text-xs">我的自動化覆蓋率</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-4xl font-extrabold text-slate-900">{automationRate}%</span>
                            <div className="flex flex-col text-xs text-slate-500 font-medium">
                                <span>{metrics.cases_automated} 已自動化</span>
                                <span>{metrics.cases_owned} 總負責</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Active Work Queue ──────────────────────────────────────────────── */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <div className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-slate-400" />
                            <h2 className="text-lg font-bold text-slate-900">待處理的測試執行</h2>
                        </div>
                        <p className="text-sm text-slate-500 mt-1">目前指派給您且尚在進行或等待中的測試執行。</p>
                    </div>

                    <div className="p-0 flex-1 overflow-x-auto">
                        {myData.assigned_runs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-slate-400">
                                <CheckCircle2 className="w-16 h-16 text-emerald-100 mb-4" />
                                <p className="text-lg font-medium text-slate-600">全部完成了！</p>
                                <p className="text-sm">目前沒有指派給您的測試執行。</p>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50/50">
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">執行名稱</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">狀態</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">進度</th>
                                        <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {myData.assigned_runs.map((run) => {
                                        const passPct = run.total > 0 ? (run.passed / run.total) * 100 : 0;
                                        const failPct = run.total > 0 ? (run.failed / run.total) * 100 : 0;
                                        const blockedPct = run.total > 0 ? (run.blocked / run.total) * 100 : 0;

                                        return (
                                            <tr key={run.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-6 py-5">
                                                    <div className="text-sm font-bold text-slate-900">{run.title}</div>
                                                    <div className="text-xs text-slate-500 mt-1">指派執行 #{run.id}</div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${runStatusBadgeClasses(run.status)}`}>
                                                        {run.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-5 w-64">
                                                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1.5 px-0.5">
                                                        <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {run.passed}</span>
                                                        <span className="text-rose-600 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> {run.failed}</span>
                                                        <span className="text-amber-500 flex items-center gap-1"><Ban className="w-3.5 h-3.5" /> {run.blocked}</span>
                                                        <span className="text-slate-400">{run.total} 總計 ({Math.round(((run.passed + run.failed + run.blocked) / run.total) * 100)}%)</span>
                                                    </div>
                                                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex shadow-inner border border-slate-200/30">
                                                        <div style={{ width: `${passPct}%` }} className="bg-emerald-500 h-full transition-all duration-500 ease-out"></div>
                                                        <div style={{ width: `${failPct}%` }} className="bg-rose-500 h-full transition-all duration-500 ease-out border-l border-white/10"></div>
                                                        <div style={{ width: `${blockedPct}%` }} className="bg-amber-400 h-full transition-all duration-500 ease-out border-l border-white/10"></div>
                                                        <div style={{ width: `${(100 - passPct - failPct - blockedPct)}%` }} className="bg-slate-200 h-full transition-all duration-500 ease-out border-l border-white/10"></div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5 text-right w-48">
                                                    <button
                                                        onClick={() => navigate(`/runs/${run.id}`)}
                                                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-bold text-primary-600 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 hover:text-primary-700 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    >
                                                        <PlayCircle className="w-4 h-4" />
                                                        繼續執行
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // --- Render: Overview ---
    const renderOverview = () => {
        if (isOverviewLoading || !overviewData) {
            return (
                <div className="flex-1 flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                </div>
            );
        }

        const summary = overviewData;

        return (
            <div className="animate-in fade-in duration-300">
                {/* 1. Summary Cards (Top Row) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div onClick={() => navigate('/project/1')} className="bg-white p-6 rounded-2xl border border-slate-200 flex flex-col hover:border-slate-300 hover:shadow-md transition-all cursor-pointer shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Layers className="w-20 h-20 text-indigo-600" />
                        </div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                                <Layers className="w-5 h-5 text-indigo-500" />
                            </div>
                            <span className="text-slate-600 font-bold tracking-wide uppercase text-xs">測試案例總數</span>
                        </div>
                        <span className="text-4xl font-extrabold text-slate-900">{summary.summary_cards.total_cases}</span>
                    </div>

                    <div onClick={() => navigate('/runs')} className="bg-white p-6 rounded-2xl border border-slate-200 flex flex-col hover:border-slate-300 hover:shadow-md transition-all cursor-pointer shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <PlayCircle className="w-20 h-20 text-primary-600" />
                        </div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                                <PlayCircle className="w-5 h-5 text-primary-500" />
                            </div>
                            <span className="text-slate-600 font-bold tracking-wide uppercase text-xs">進行中的測試執行</span>
                        </div>
                        <span className="text-4xl font-extrabold text-slate-900">{summary.summary_cards.active_runs}</span>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 flex flex-col shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 transition-opacity">
                            <Bug className="w-20 h-20 text-orange-600" />
                        </div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                                <Bug className="w-5 h-5 text-orange-500" />
                            </div>
                            <span className="text-slate-600 font-bold tracking-wide uppercase text-xs">已記錄缺陷 (Jira)</span>
                        </div>
                        <span className="text-4xl font-extrabold text-slate-900">{summary.summary_cards.total_defects}</span>
                    </div>
                </div>

                {/* 2. Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {/* Donut Chart: Runs by Type */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col">
                        <h3 className="text-base font-bold text-slate-900 mb-4">各類型測試執行數</h3>
                        <div className="flex-1 w-full min-h-[300px]">
                            {summary.run_types_distribution.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={summary.run_types_distribution}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={80}
                                            outerRadius={110}
                                            paddingAngle={5}
                                            dataKey="value"
                                            label={({ value }) => value}
                                        >
                                            {summary.run_types_distribution.map((_, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip
                                            formatter={(value: any) => [value, '執行數']}
                                            contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        />
                                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-400 text-sm">尚無執行資料</div>
                            )}
                        </div>
                    </div>

                    {/* Grouped Bar Chart: Pass/Fail Rate by Run Type */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col">
                        <h3 className="text-base font-bold text-slate-900 mb-4">各類型通過 / 失敗比率</h3>
                        <div className="flex-1 w-full min-h-[300px]">
                            {summary.run_type_pass_fail.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={summary.run_type_pass_fail}
                                        margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="run_type" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dx={-10} />
                                        <RechartsTooltip
                                            cursor={{ fill: '#f8fafc' }}
                                            contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        />
                                        <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} />
                                        <Bar dataKey="passed" name="通過" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40}>
                                            <LabelList dataKey="passed" position="top" fill="#10b981" fontSize={11} formatter={(v: any) => Number(v) > 0 ? v : ''} />
                                        </Bar>
                                        <Bar dataKey="failed" name="失敗" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40}>
                                            <LabelList dataKey="failed" position="top" fill="#ef4444" fontSize={11} formatter={(v: any) => Number(v) > 0 ? v : ''} />
                                        </Bar>
                                        <Bar dataKey="blocked" name="封鎖" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40}>
                                            <LabelList dataKey="blocked" position="top" fill="#f59e0b" fontSize={11} formatter={(v: any) => Number(v) > 0 ? v : ''} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-400 text-sm">尚無通過/失敗資料</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* 3. Tables Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Recent Test Runs */}
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                        <div className="p-5 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
                            <Clock className="w-5 h-5 text-primary-500" />
                            <h3 className="text-base font-bold text-slate-900">最近的測試執行</h3>
                        </div>
                        <div className="p-0 flex-1 overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-200">
                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">執行名稱</th>
                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">類型</th>
                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">進度</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {summary.recent_runs.length === 0 ? (
                                        <tr><td colSpan={3} className="px-5 py-8 text-center text-sm text-slate-400">尚無測試執行記錄</td></tr>
                                    ) : (
                                        summary.recent_runs.map(run => {
                                            const passPct = run.total > 0 ? (run.passed / run.total) * 100 : 0;
                                            const failPct = run.total > 0 ? (run.failed / run.total) * 100 : 0;
                                            const blockedPct = run.total > 0 ? (run.blocked / run.total) * 100 : 0;
                                            const skipPct = run.total > 0 ? ((run.skipped || 0) / run.total) * 100 : 0;
                                            const untestedPct = run.total > 0 ? ((run.untested || 0) / run.total) * 100 : 0;
                                            return (
                                                <tr key={run.id} onClick={() => navigate(`/runs/${run.id}`)} className="hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-50 last:border-0">
                                                    <td className="px-5 py-4">
                                                        <div className="text-sm font-semibold text-slate-900 mb-0.5">{run.title}</div>
                                                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{run.status}</div>
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap">
                                                            {run.run_type || '功能測試'}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-4 w-40">
                                                        <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 mb-1">
                                                            <span className="text-emerald-600 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> {run.passed}</span>
                                                            <span className="text-rose-600 flex items-center gap-0.5"><XCircle className="w-3 h-3" /> {run.failed}</span>
                                                            <span className="text-amber-500 flex items-center gap-0.5"><Ban className="w-3 h-3" /> {run.blocked}</span>
                                                        </div>
                                                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                                                            <div style={{ width: `${passPct}%` }} className="bg-emerald-500 h-full"></div>
                                                            <div style={{ width: `${failPct}%` }} className="bg-rose-500 h-full"></div>
                                                            <div style={{ width: `${blockedPct}%` }} className="bg-amber-400 h-full"></div>
                                                            <div style={{ width: `${skipPct}%` }} className="bg-slate-400 h-full"></div>
                                                            <div style={{ width: `${untestedPct}%` }} className="bg-slate-200 h-full"></div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Top Failing Test Cases */}
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                        <div className="p-5 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
                            <AlertTriangle className="w-5 h-5 text-rose-500" />
                            <h3 className="text-base font-bold text-slate-900">失敗率最高的案例</h3>
                        </div>
                        <div className="p-0 flex-1 overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-200">
                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">測試案例名稱</th>
                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">失敗次數</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {summary.top_failing_cases.length === 0 ? (
                                        <tr><td colSpan={2} className="px-5 py-8 text-center text-sm text-slate-400">尚未記錄任何失敗案例</td></tr>
                                    ) : (
                                        summary.top_failing_cases.map((tc, i) => (
                                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-5 py-4">
                                                    <div className="text-sm font-medium text-slate-800 line-clamp-2">{tc.title}</div>
                                                </td>
                                                <td className="px-5 py-4 text-right">
                                                    <span className="inline-flex items-center justify-center px-2.5 py-1 rounded bg-rose-50 text-rose-700 text-xs font-bold border border-rose-100">
                                                        {tc.fail_count}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex-1 p-8 overflow-y-auto bg-slate-50 w-full h-full">
            <div className="mb-8 flex flex-col gap-6 border-b border-slate-200 pb-6">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">儀表板</h1>
                    <p className="text-slate-500 mt-2 text-sm">歡迎回來！以下是您的測試進度與專案健康概覽。</p>
                </div>

                {/* Tabs - Moved to left and made more prominent */}
                <div className="flex bg-slate-200/60 p-1.5 rounded-xl w-fit border border-slate-200/60 shadow-inner">
                    <button
                        onClick={() => setActiveTab('my_space')}
                        className={`flex items-center gap-2 px-8 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'my_space'
                            ? 'bg-white text-primary-700 shadow-sm ring-1 ring-slate-200/50'
                            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                            }`}
                    >
                        我的工作區
                    </button>
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`flex items-center gap-2 px-8 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'overview'
                            ? 'bg-white text-primary-700 shadow-sm ring-1 ring-slate-200/50'
                            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                            }`}
                    >
                        專案總覽
                    </button>
                </div>
            </div>

            {activeTab === 'my_space' ? renderMySpace() : renderOverview()}

            <div className="h-10"></div>
        </div>
    );
}
