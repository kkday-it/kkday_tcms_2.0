import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, PlayCircle, Loader2, Bug, AlertTriangle, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../lib/api';

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

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

export default function Dashboard() {
    const navigate = useNavigate();
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchSummary = async () => {
            try {
                const response = await api.get('/dashboard/summary');
                setSummary(response.data);
            } catch (error) {
                console.error("Failed to fetch dashboard summary", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchSummary();
    }, []);

    if (isLoading || !summary) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-50">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            </div>
        );
    }

    return (
        <div className="flex-1 p-8 overflow-y-auto bg-slate-50">
            <h1 className="text-2xl font-bold text-slate-900 mb-6">Dashboard</h1>

            {/* 1. Summary Cards (Top Row) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div onClick={() => navigate('/project/1')} className="bg-white p-6 rounded-xl border border-slate-200 flex flex-col hover:border-slate-300 hover:shadow-md transition-all cursor-pointer shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Layers className="w-16 h-16 text-indigo-600" />
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                        <Layers className="w-5 h-5 text-indigo-500" />
                        <span className="text-slate-600 font-medium">Total Test Cases</span>
                    </div>
                    <span className="text-4xl font-bold text-slate-900">{summary.summary_cards.total_cases}</span>
                </div>

                <div onClick={() => navigate('/runs')} className="bg-white p-6 rounded-xl border border-slate-200 flex flex-col hover:border-slate-300 hover:shadow-md transition-all cursor-pointer shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <PlayCircle className="w-16 h-16 text-primary-600" />
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                        <PlayCircle className="w-5 h-5 text-primary-500" />
                        <span className="text-slate-600 font-medium">Active Test Runs</span>
                    </div>
                    <span className="text-4xl font-bold text-slate-900">{summary.summary_cards.active_runs}</span>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 flex flex-col shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 transition-opacity">
                        <Bug className="w-16 h-16 text-orange-600" />
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                        <Bug className="w-5 h-5 text-orange-500" />
                        <span className="text-slate-600 font-medium">Defects Logged (Jira)</span>
                    </div>
                    <span className="text-4xl font-bold text-slate-900">{summary.summary_cards.total_defects}</span>
                </div>
            </div>

            {/* 2. Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Donut Chart: Runs by Type */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col">
                    <h3 className="text-base font-bold text-slate-900 mb-4">Test Runs by Type</h3>
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
                                    >
                                        {summary.run_types_distribution.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip
                                        formatter={(value: any) => [value, 'Runs']}
                                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm">No run data available</div>
                        )}
                    </div>
                </div>

                {/* Grouped Bar Chart: Pass/Fail Rate by Run Type */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col">
                    <h3 className="text-base font-bold text-slate-900 mb-4">Pass / Fail by Run Type</h3>
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
                                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} />
                                    <Bar dataKey="passed" name="Passed" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                    <Bar dataKey="failed" name="Failed" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm">No pass/fail data available</div>
                        )}
                    </div>
                </div>
            </div>

            {/* 3. Tables Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Test Runs */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                    <div className="p-5 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
                        <Clock className="w-5 h-5 text-primary-500" />
                        <h3 className="text-base font-bold text-slate-900">Recent Test Runs</h3>
                    </div>
                    <div className="p-0 flex-1 overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Run</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Progress</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {summary.recent_runs.length === 0 ? (
                                    <tr><td colSpan={3} className="px-5 py-8 text-center text-sm text-slate-400">No recent runs</td></tr>
                                ) : (
                                    summary.recent_runs.map(run => {
                                        const passPct = run.total > 0 ? (run.passed / run.total) * 100 : 0;
                                        const failPct = run.total > 0 ? (run.failed / run.total) * 100 : 0;
                                        return (
                                            <tr key={run.id} onClick={() => navigate(`/runs/${run.id}`)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                                                <td className="px-5 py-3">
                                                    <div className="text-sm font-semibold text-slate-900 truncate max-w-[200px]">{run.title}</div>
                                                    <div className="text-xs text-slate-500">{run.status}</div>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap">
                                                        {run.run_type || 'Feature Test'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 w-40">
                                                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 mb-1">
                                                        <span className="text-emerald-600 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> {run.passed}</span>
                                                        <span className="text-rose-600 flex items-center gap-0.5"><XCircle className="w-3 h-3" /> {run.failed}</span>
                                                    </div>
                                                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                                                        <div style={{ width: `${passPct}%` }} className="bg-emerald-500 h-full"></div>
                                                        <div style={{ width: `${failPct}%` }} className="bg-rose-500 h-full"></div>
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
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                    <div className="p-5 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
                        <AlertTriangle className="w-5 h-5 text-rose-500" />
                        <h3 className="text-base font-bold text-slate-900">Top Failing Cases</h3>
                    </div>
                    <div className="p-0 flex-1 overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Test Case Title</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Failures</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {summary.top_failing_cases.length === 0 ? (
                                    <tr><td colSpan={2} className="px-5 py-8 text-center text-sm text-slate-400">No failing cases recorded yet</td></tr>
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

            <div className="h-10"></div>
        </div>
    );
}
