import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, ArrowLeft, CheckCircle2, XCircle, SkipForward } from 'lucide-react';
import api from '../lib/api';
import TestCaseExecutionPane from '../components/runs/TestCaseExecutionPane';

interface TestResult {
    id: number;
    run_id: number;
    case_id: number;
    status: string;
    duration_ms?: number;
    comment?: string;
    executed_at?: string;
    assignee_id?: number;
    // We might need test case details here, assuming backend joins it
    test_case?: {
        title: string;
        external_id?: string;
        priority: string;
    };
}

interface AppUser {
    id: number;
    username: string;
}

export default function TestRunDetails() {
    const { runId } = useParams();
    const [results, setResults] = useState<TestResult[]>([]);
    const [testRun, setTestRun] = useState<{ title: string; status: string; run_type?: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    // Case details modal
    const [selectedResultId, setSelectedResultId] = useState<number | null>(null);

    // Unsaved assignee state mapping resultId -> assigneeId string
    const [unsavedAssignees, setUnsavedAssignees] = useState<Record<number, string>>({});
    const [users, setUsers] = useState<AppUser[]>([]);

    // Batch selection
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
    const [batchAssigneeId, setBatchAssigneeId] = useState<string>('');
    // Fetch functions
    const fetchData = async () => {
        setIsLoading(true);
        try {
            const runRes = await api.get(`/runs/${runId}`);
            setTestRun(runRes.data);

            const resultsRes = await api.get(`/results/run/${runId}`);
            setResults(resultsRes.data);

            // Fetch users for assignee dropdown
            const usersRes = await api.get('/users/');
            setUsers(usersRes.data);

            // Initialize unsaved assignee states
            const initAssignees: Record<number, string> = {};
            resultsRes.data.forEach((r: TestResult) => {
                if (r.assignee_id) {
                    initAssignees[r.id] = String(r.assignee_id);
                }
            });
            setUnsavedAssignees(initAssignees);

        } catch (error) {
            console.error("Failed to fetch data", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (runId) {
            fetchData();
        }
    }, [runId]);

    const handleUpdateStatus = async (resultId: number, newStatus: string) => {
        try {
            // Optimistic update
            setResults(prev => prev.map(r => r.id === resultId ? { ...r, status: newStatus } : r));
            await api.put(`/results/${resultId}`, {
                status: newStatus,
                duration_ms: 1000 // mock duration for now
            });
            // Re-fetch to get exact executed_at from backend if needed
            fetchData();
        } catch (error) {
            console.error("Failed to update status", error);
            alert("Failed to update status");
            fetchData(); // Revert on failure
        }
    };

    const handleAssign = async (resultId: number) => {
        const assignee_id = unsavedAssignees[resultId];
        try {
            // Optimistic update
            setResults(prev => prev.map(r => r.id === resultId ? { ...r, assignee_id: assignee_id ? Number(assignee_id) : undefined } : r));
            await api.put(`/results/${resultId}`, {
                assignee_id: assignee_id ? Number(assignee_id) : null
            });
            // Re-fetch to confirm
            // fetchData();
        } catch (error) {
            console.error("Failed to assign user", error);
            alert("Failed to assign user");
            // Revert on failure
            setResults(prev => prev.map(r => r.id === resultId ? { ...r, assignee_id: r.assignee_id } : r));
        }
    };

    const handleAssignChange = (resultId: number, value: string) => {
        setUnsavedAssignees(prev => ({ ...prev, [resultId]: value }));
    };

    const toggleRow = (id: number) => {
        setSelectedRows(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        setSelectedRows(selectedRows.size === results.length ? new Set() : new Set(results.map(r => r.id)));
    };

    const handleBatchAssign = async () => {
        try {
            await Promise.all([...selectedRows].map(resultId =>
                api.put(`/results/${resultId}`, { assignee_id: batchAssigneeId ? Number(batchAssigneeId) : null })
            ));
            setSelectedRows(new Set());
            setBatchAssigneeId('');
            fetchData();
        } catch (err) {
            console.error("Batch assign failed", err);
            alert("Failed to batch assign");
        }
    };

    const handleCompleteRun = async () => {
        if (!window.confirm("Are you sure you want to mark this run as Done?")) return;
        try {
            await api.put(`/runs/${runId}`, { status: 'Done' });
            fetchData();
        } catch (error) {
            console.error("Failed to complete run", error);
            alert("Failed to complete test run");
        }
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-50">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            </div>
        );
    }

    const passed = results.filter(r => r.status === 'Passed').length;
    const failed = results.filter(r => r.status === 'Failed').length;
    const unt = results.filter(r => r.status === 'Untested').length;
    const total = results.length;
    const passPct = total > 0 ? Math.round((passed / total) * 100) : 0;
    const failPct = total > 0 ? Math.round((failed / total) * 100) : 0;

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50 relative overflow-hidden">
            {/* Header */}
            <div className="px-8 py-6 border-b border-slate-200 bg-white shadow-sm z-10">
                <div className="flex items-center gap-4 mb-4">
                    <Link to="/runs" className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900">{testRun?.title || 'Test Run Execution'}</h1>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium border bg-indigo-50 text-indigo-700 border-indigo-200">
                        {testRun?.run_type || 'Feature Test'}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${testRun?.status === 'Done' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-primary-50 text-primary-700 border-primary-200'}`}>
                        {testRun?.status || 'Pending'}
                    </span>

                    {testRun?.status !== 'Done' && (
                        <div className="ml-auto">
                            <button
                                onClick={handleCompleteRun}
                                className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
                            >
                                Complete Run
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-6 text-sm text-slate-600">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{total}</span> Cases
                        </div>
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" /> <span className="font-semibold text-green-600">{passed}</span> Passed
                        </div>
                        <div className="flex items-center gap-2">
                            <XCircle className="w-4 h-4 text-red-500" /> <span className="font-semibold text-red-600">{failed}</span> Failed
                        </div>
                        <div className="flex items-center gap-2">
                            <SkipForward className="w-4 h-4 text-slate-400" /> <span className="font-semibold text-slate-500">{unt}</span> Untested
                        </div>
                    </div>

                    <div className="w-full md:w-96">
                        <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1.5">
                            <span>Progress</span>
                            <span>{Math.round(((passed + failed) / total) * 100) || 0}% Completed</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                            <div style={{ width: `${passPct}%` }} className="bg-green-500 h-full transition-all duration-500"></div>
                            <div style={{ width: `${failPct}%` }} className="bg-red-500 h-full transition-all duration-500"></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto w-full p-8">
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    {/* Batch action bar */}
                    {selectedRows.size > 0 && (
                        <div className="flex items-center gap-3 px-6 py-3 bg-primary-50 border-b border-primary-100">
                            <span className="text-sm font-semibold text-primary-700">{selectedRows.size} selected</span>
                            <div className="flex items-center gap-2 ml-auto">
                                <span className="text-sm text-slate-600 font-medium">Assign to:</span>
                                <select
                                    value={batchAssigneeId}
                                    onChange={e => setBatchAssigneeId(e.target.value)}
                                    className="text-sm rounded-md border-slate-300 py-1.5 pl-2 pr-8 shadow-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                                >
                                    <option value="">— Unassign —</option>
                                    {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                                </select>
                                <button
                                    onClick={handleBatchAssign}
                                    className="px-4 py-1.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
                                >
                                    Apply
                                </button>
                                <button
                                    onClick={() => setSelectedRows(new Set())}
                                    className="px-3 py-1.5 text-sm font-medium text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                    )}
                    <table className="w-full text-left border-collapse min-w-max">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr className="text-xs text-slate-500 uppercase tracking-wider">
                                <th className="py-3 px-4 w-10 border-b border-slate-200">
                                    <input
                                        type="checkbox"
                                        checked={selectedRows.size === results.length && results.length > 0}
                                        onChange={toggleAll}
                                        className="size-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
                                    />
                                </th>
                                <th className="py-3 font-semibold px-6 border-b border-slate-200">Case Title</th>
                                <th className="py-3 font-semibold px-4 w-32 border-b border-slate-200">Priority</th>
                                <th className="py-3 font-semibold px-4 w-40 border-b border-slate-200">Assignee</th>
                                <th className="py-3 font-semibold px-4 w-40 border-b border-slate-200">Status</th>
                                <th className="py-3 font-semibold px-6 w-56 text-right border-b border-slate-200">Execute</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {results.map((res) => (
                                <tr
                                    key={res.id}
                                    onClick={() => setSelectedResultId(res.id)}
                                    className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${selectedRows.has(res.id) ? 'bg-primary-50/40' : ''}`}
                                >
                                    <td className="py-4 px-4 w-10" onClick={e => { e.stopPropagation(); toggleRow(res.id); }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedRows.has(res.id)}
                                            onChange={() => toggleRow(res.id)}
                                            className="size-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
                                        />
                                    </td>
                                    <td className="py-4 px-6 font-medium text-slate-900 flex items-center gap-3">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-xs font-mono text-slate-400">
                                                TC-{res.case_id}
                                                {res.test_case?.external_id && (
                                                    <span className="ml-1 px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded whitespace-nowrap">
                                                        {res.test_case.external_id}
                                                    </span>
                                                )}
                                            </span>
                                            <span>{res.test_case?.title || 'Unknown Case'}</span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 text-sm text-slate-600">
                                        {res.test_case?.priority || 'Unknown'}
                                    </td>
                                    <td className="py-4 px-4">
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={unsavedAssignees[res.id] || ''}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => handleAssignChange(res.id, e.target.value)}
                                                className="w-full text-xs rounded-md border-slate-200 py-1.5 pl-2 pr-6 text-slate-700 shadow-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 bg-white hover:bg-slate-50 cursor-pointer"
                                            >
                                                <option value="">Unassigned</option>
                                                {users.map(u => (
                                                    <option key={u.id} value={u.id}>{u.username}</option>
                                                ))}
                                            </select>
                                            {(unsavedAssignees[res.id] || '') !== (res.assignee_id ? String(res.assignee_id) : '') && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleAssign(res.id); }}
                                                    className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-primary-50 text-primary-700 hover:bg-primary-100 border border-primary-200 rounded shrink-0 transition-colors"
                                                >
                                                    Save
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-4 px-4">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium 
                                            ${res.status === 'Passed' ? 'bg-green-100 text-green-700 border border-green-200' :
                                                res.status === 'Failed' ? 'bg-red-100 text-red-700 border border-red-200' :
                                                    'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                                            {res.status}
                                        </span>
                                    </td>
                                    <td className="py-4 px-6 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(res.id, 'Passed'); }}
                                                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors flex items-center gap-1.5
                                                    ${res.status === 'Passed' ? 'bg-green-500 text-white border-green-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-green-600'}`}
                                            >
                                                <CheckCircle2 className="w-3.5 h-3.5" /> Pass
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(res.id, 'Failed'); }}
                                                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors flex items-center gap-1.5
                                                    ${res.status === 'Failed' ? 'bg-red-500 text-white border-red-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-red-600'}`}
                                            >
                                                <XCircle className="w-3.5 h-3.5" /> Fail
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {results.length === 0 && (
                        <div className="p-8 text-center text-slate-500">
                            <p>No test cases found in this run.</p>
                        </div>
                    )}
                </div>
            </div>

            <TestCaseExecutionPane
                resultId={selectedResultId}
                onClose={() => setSelectedResultId(null)}
                onUpdated={fetchData}
            />
        </div>
    );
}
