import { useState, useEffect } from 'react';
import { X, Edit2, Loader2, History as HistoryIcon, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import api from '../../lib/api';
import { useUsers } from '../../lib/useUsers';

interface TestStep {
    action: string;
    data?: string;
    expected_result: string;
}

interface TestCasePreview {
    id: number;
    title: string;
    lifecycle_status?: string;
    priority?: string;
    automation_status?: string;
    preconditions?: string;
    external_id?: string;
    tags?: string;
    labels?: string;
    jira_keys?: string;
    default_owner_id?: number | null;
    type?: string;
    layer?: string;
    steps?: TestStep[];
}

interface TestCasePreviewPaneProps {
    isOpen: boolean;
    onClose: () => void;
    caseId: number | null;
    onEditClick: (caseId: number) => void;
    refreshKey?: number; // Increment this to force a data re-fetch
}

export default function TestCasePreviewPane({ isOpen, onClose, caseId, onEditClick, refreshKey = 0 }: TestCasePreviewPaneProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [testCase, setTestCase] = useState<TestCasePreview | null>(null);
    const { users } = useUsers();

    // History 
    const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');
    const [historyLogs, setHistoryLogs] = useState<any[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    useEffect(() => {
        if (isOpen && caseId) {
            setIsLoading(true);
            api.get(`/cases/${caseId}`)
                .then(res => setTestCase(res.data))
                .catch(err => console.error("Failed to fetch case for preview", err))
                .finally(() => setIsLoading(false));

            // Fetch history
            setIsLoadingHistory(true);
            api.get(`/cases/${caseId}/history`)
                .then(res => setHistoryLogs(res.data))
                .catch(err => console.error("Failed to fetch history", err))
                .finally(() => setIsLoadingHistory(false));

        } else {
            setTestCase(null);
            setHistoryLogs([]);
            setActiveTab('details');
        }
    }, [isOpen, caseId, refreshKey]);

    if (!isOpen || !caseId) return null;

    const renderHtmlOrMarkdown = (content?: string) => {
        if (!content) return <span className="text-slate-400 italic">無</span>;

        // Use react-markdown with rehype-raw to parse both HTML tags and Markdown syntax cleanly.
        return (
            <div className="text-sm text-slate-700 leading-relaxed font-mono prose prose-sm max-w-none">
                <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                    {content}
                </ReactMarkdown>
            </div>
        );
    };

    const getTags = () => {
        if (!testCase?.tags) return [];
        try {
            if (testCase.tags.startsWith('[')) return JSON.parse(testCase.tags);
            return testCase.tags.split(',').map(t => t.trim()).filter(Boolean);
        } catch {
            return testCase.tags.split(',').map(t => t.trim()).filter(Boolean);
        }
    };

    const getLabels = () => {
        if (!testCase?.labels) return [];
        try {
            if (testCase.labels.startsWith('[')) return JSON.parse(testCase.labels);
            return testCase.labels.split(',').map(l => l.trim()).filter(Boolean);
        } catch {
            return testCase.labels.split(',').map(l => l.trim()).filter(Boolean);
        }
    };

    const assignee = users.find(u => u.id === testCase?.default_owner_id);

    return (
        <div className="absolute inset-y-0 right-0 z-30 flex justify-end w-full max-w-2xl">
            <div className="relative w-full bg-white h-full border-l border-slate-200 shadow-xl flex flex-col animate-in slide-in-from-right">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-mono text-slate-500 bg-white px-2 py-1 border border-slate-200 rounded">TC-{caseId}</span>
                        {testCase?.external_id && (
                            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">{testCase.external_id}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onEditClick(caseId)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md transition-colors"
                        >
                            <Edit2 className="w-4 h-4" /> 編輯
                        </button>
                        <div className="w-px h-6 bg-slate-200 mx-1"></div>
                        <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 rounded-md transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200 bg-white shrink-0 px-6">
                    <button
                        onClick={() => setActiveTab('details')}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'details' ? 'border-primary-500 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <FileText className="w-4 h-4" /> 詳細資訊
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'history' ? 'border-primary-500 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <HistoryIcon className="w-4 h-4" /> 歷史紀錄
                    </button>
                </div>

                {isLoading || !testCase ? (
                    <div className="flex-1 flex items-center justify-center bg-white">
                        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto bg-white flex flex-col">

                        {activeTab === 'details' && (
                            <div className="px-8 py-6 space-y-8 flex-1">
                                {/* Title Section */}
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-900 leading-tight mb-4">{testCase.title}</h2>
                                    <div className="flex flex-wrap gap-2 text-xs">
                                        <span className="inline-flex items-baseline px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                            <span className="font-semibold mr-1">狀態:</span> {testCase.lifecycle_status || 'Draft'}
                                        </span>
                                        <span className={`inline-flex items-baseline px-2.5 py-1 rounded-full border ${testCase.automation_status === 'Automated' ? 'border-primary-200 text-primary-700 bg-primary-50' : 'border-slate-200 text-slate-600 bg-slate-50'}`}>
                                            <span className="font-semibold mr-1">自動化:</span> {testCase.automation_status || 'Manual'}
                                        </span>
                                        {(() => {
                                            const p = testCase.priority || 'Medium';
                                            const colors = {
                                                'Highest': 'text-rose-600 bg-rose-50 border-rose-100',
                                                'High': 'text-orange-600 bg-orange-50 border-orange-100',
                                                'Medium': 'text-blue-600 bg-blue-50 border-blue-100',
                                                'Low': 'text-slate-500 bg-slate-50 border-slate-100'
                                            }[p] || 'text-slate-500 bg-slate-100 border-slate-200';
                                            return (
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border capitalize ${colors}`}>
                                                    <span className="font-semibold mr-1 opacity-70">優先級:</span> {p}
                                                </span>
                                            );
                                        })()}
                                        <span className="inline-flex items-baseline px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                            <span className="font-semibold mr-1">層級:</span> {testCase.layer || 'E2E'}
                                        </span>
                                        <span className="inline-flex items-baseline px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                            <span className="font-semibold mr-1">類型:</span> {testCase.type || 'Functional'}
                                        </span>
                                        <span className="inline-flex items-baseline px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                            <span className="font-semibold mr-1">負責人:</span> {assignee ? (assignee.full_name || assignee.username) : '未指定'}
                                        </span>
                                    </div>
                                </div>

                                {/* Badges Section */}
                                {(getTags().length > 0 || getLabels().length > 0 || testCase.jira_keys) && (
                                    <section className="bg-slate-50 p-4 rounded-lg border border-slate-100 space-y-4">
                                        {getTags().length > 0 && (
                                            <div className="flex items-start gap-4">
                                                <span className="text-xs font-semibold text-slate-500 w-16 pt-1">標籤</span>
                                                <div className="flex flex-wrap gap-1.5 flex-1">
                                                    {getTags().map((t: string, i: number) => (
                                                        <span key={i} className="px-2 py-0.5 bg-white border border-slate-200 text-slate-600 text-xs rounded shadow-sm">{t}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {getLabels().length > 0 && (
                                            <div className="flex items-start gap-4">
                                                <span className="text-xs font-semibold text-slate-500 w-16 pt-1">分類</span>
                                                <div className="flex flex-wrap gap-1.5 flex-1">
                                                    {getLabels().map((l: string, i: number) => (
                                                        <span key={i} className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs rounded shadow-sm">{l}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {testCase.jira_keys && (
                                            <div className="flex items-start gap-4">
                                                <span className="text-xs font-semibold text-slate-500 w-16 pt-0.5">Jira Keys</span>
                                                <div className="flex-1 text-sm font-mono text-blue-600">
                                                    {testCase.jira_keys}
                                                </div>
                                            </div>
                                        )}
                                    </section>
                                )}

                                {/* Preconditions */}
                                <section>
                                    <h3 className="text-sm font-bold text-slate-900 mb-3 pb-2 border-b border-slate-100">前置條件</h3>
                                    <div className="bg-slate-50/50 p-4 rounded-lg border border-slate-100">
                                        {renderHtmlOrMarkdown(testCase.preconditions)}
                                    </div>
                                </section>

                                {/* Steps */}
                                <section>
                                    <h3 className="text-sm font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">
                                        測試步驟 <span className="text-slate-400 font-normal ml-2">({testCase.steps?.length || 0})</span>
                                    </h3>

                                    {!testCase.steps || testCase.steps.length === 0 ? (
                                        <div className="text-center p-8 bg-slate-50 border border-slate-100 rounded-lg text-slate-400 text-sm">
                                            此測試案例尚未定義步驟。
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {testCase.steps.map((step, idx) => (
                                                <div key={idx} className="flex gap-4">
                                                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold border border-slate-200">
                                                        {idx + 1}
                                                    </div>
                                                    <div className="flex-1 space-y-3 pt-1">
                                                        <div>
                                                            <div className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">操作</div>
                                                            <div className="text-sm text-slate-800">{renderHtmlOrMarkdown(step.action)}</div>
                                                        </div>

                                                        {step.data && (
                                                            <div className="bg-amber-50/50 p-3 rounded border border-amber-100/50">
                                                                <div className="text-xs font-semibold text-amber-600/70 mb-1 uppercase tracking-wider">測試資料</div>
                                                                <div className="text-sm text-slate-700">{renderHtmlOrMarkdown(step.data)}</div>
                                                            </div>
                                                        )}

                                                        <div className="bg-emerald-50/50 p-3 rounded border border-emerald-100/50">
                                                            <div className="text-xs font-semibold text-emerald-600/70 mb-1 uppercase tracking-wider">預期結果</div>
                                                            <div className="text-sm text-slate-700">{renderHtmlOrMarkdown(step.expected_result)}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>

                                {/* Bottom padding */}
                                <div className="h-8"></div>
                            </div>
                        )}

                        {activeTab === 'history' && (
                            <div className="px-8 py-6 flex-1 bg-slate-50/50">
                                {isLoadingHistory ? (
                                    <div className="flex items-center justify-center p-8">
                                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                                    </div>
                                ) : historyLogs.length === 0 ? (
                                    <div className="text-center p-8 text-slate-500">此測試案例尚無歷史紀錄。</div>
                                ) : (
                                    <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                                        {(() => {
                                            const ACTION_ZH: Record<string, string> = {
                                                Created: '建立',
                                                Updated: '更新',
                                                Archived: '封存',
                                                Restored: '還原',
                                                Moved: '移動',
                                            };
                                            const FIELD_ZH: Record<string, string> = {
                                                title: '標題',
                                                status: '狀態',
                                                suite_id: 'Suite',
                                                priority: '優先級',
                                                layer: '層級',
                                                type: '類型',
                                                automation_status: '自動化',
                                                preconditions: '前置條件',
                                                steps: '測試步驟',
                                                tags: '標籤',
                                                labels: '分類',
                                                jira_keys: 'Jira Keys',
                                                external_id: '外部 ID',
                                                description: '描述',
                                            };
                                            return historyLogs.map((log: any, idx: number) => {
                                                const actionZh = ACTION_ZH[log.action] ?? log.action;
                                                const ActionColor = log.action === 'Created' ? 'bg-emerald-500' : 'bg-blue-500';
                                                let changesObj: any = {};
                                                try {
                                                    if (log.changed_fields) changesObj = JSON.parse(log.changed_fields);
                                                } catch (e) { }

                                                return (
                                                    <div key={log.id || idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                                        {/* Event dot */}
                                                        <div className={`flex items-center justify-center w-3 h-3 rounded-full border-4 border-white ${ActionColor} shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10`}></div>

                                                        {/* Card */}
                                                        <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] p-4 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="font-semibold text-slate-900 text-sm">{actionZh}</span>
                                                                <span className="text-xs text-slate-400 font-mono">
                                                                    {new Date(log.created_at).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </div>
                                                            <div className="text-xs text-slate-500 mb-2">
                                                                由 <span className="font-medium text-slate-700">{log.user?.full_name || log.user?.username || '系統'}</span>
                                                            </div>

                                                            {Object.keys(changesObj).length > 0 && (
                                                                <div className="mt-3 space-y-1.5 bg-slate-50 p-2.5 rounded text-xs font-mono">
                                                                    {Object.entries(changesObj).map(([field, delta]: [string, any]) => (
                                                                        <div key={field} className="flex flex-col gap-0.5">
                                                                            <span className="font-semibold text-slate-600">{FIELD_ZH[field] ?? field}:</span>
                                                                            <span className="text-slate-500 pl-2 break-all">{String(delta)}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
