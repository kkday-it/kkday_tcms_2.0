import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, CheckCircle2, XCircle, Ban, SkipForward, Clock, FileWarning, Image as ImageIcon, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import api from '../../lib/api';
import { caseLabel } from '../../lib/caseLabel';
import { useUsers } from '../../lib/useUsers';

// Types
interface TestStep {
    step_id: number;
    order: number;
    action: string;
    data?: string;
    expected_result?: string;
    status: string; // "Untested" | "Passed" | "Failed"
    actual_result?: string;
    step_result_id?: number | null;
}

interface TestResultDetail {
    id: number;
    run_id: number;
    case_id: number;
    status: string;
    jira_bug_id?: string;
    attachment_url?: string;
    comment?: string;
    assignee_id?: number;
    test_case: {
        title: string;
        external_id?: string;
        description?: string;
        preconditions?: string;
        priority: string;
        status: string;
        automation_status: string;
        tags?: string;
        labels?: string;
    };
    steps: TestStep[];
}

interface Props {
    resultId: number | null;
    onClose: () => void;
    onUpdated: () => void; // Triggered when overall case status changes
}

export default function TestCaseExecutionPane({ resultId, onClose, onUpdated }: Props) {
    const [detail, setDetail] = useState<TestResultDetail | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const { users } = useUsers();

    const resolveAssignee = (id?: number) => {
        if (!id) return null;
        const u = users.find(x => x.id === id);
        return u ? (u.full_name || u.username) : `#${id}`;
    };

    // KQT-15184: remark-gfm so xmind-imported "1. xxx\n2. yyy" plain text is
    // parsed as a real <ol>. Actual list markers come from the `.prose ol/ul`
    // rules in index.css (Tailwind v4 Preflight otherwise strips list-style).
    const renderMarkdown = (text: string | undefined) => {
        if (!text) return null;
        return (
            <div className="text-sm text-slate-700 leading-relaxed prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                    {text}
                </ReactMarkdown>
            </div>
        );
    };

    // Resizing state
    const [width, setWidth] = useState(600);
    const [isResizing, setIsResizing] = useState(false);
    const sidebarRef = useRef<HTMLDivElement>(null);

    // Form states for bug tracking
    const [jiraBugId, setJiraBugId] = useState('');
    const [attachmentUrl, setAttachmentUrl] = useState('');

    useEffect(() => {
        if (!resultId) return;

        const fetchDetails = async () => {
            setIsLoading(true);
            try {
                const res = await api.get(`/results/${resultId}/details`);
                setDetail(res.data);
                setJiraBugId(res.data.jira_bug_id || '');
                setAttachmentUrl(res.data.attachment_url || '');
            } catch (error) {
                console.error("Failed to load result details", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDetails();
    }, [resultId]);

    // Resizer Logic
    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (isResizing && sidebarRef.current) {
            // Screen width - mouse X position = new width
            const newWidth = window.innerWidth - e.clientX;
            if (newWidth > 300 && newWidth < 1200) {
                setWidth(newWidth);
            }
        }
    }, [isResizing]);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing, resize, stopResizing]);

    const handleStepUpdate = async (stepId: number, status: string, actualResult?: string) => {
        if (!detail) return;

        // Compute updated steps before async call (for all-passed check)
        const updatedSteps = detail.steps.map(s =>
            s.step_id === stepId ? { ...s, status } : s
        );

        // Optimistic update
        setDetail(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                steps: prev.steps.map(s => s.step_id === stepId ? { ...s, status, actual_result: actualResult !== undefined ? actualResult : s.actual_result } : s)
            };
        });

        try {
            await api.put(`/results/${detail.id}/steps/${stepId}`, {
                status,
                actual_result: actualResult
            });
            // Auto-fail case if a step fails
            if (status === 'Failed' && detail.status !== 'Failed') {
                handleCaseUpdate('Failed');
            // Auto-pass case if all steps are now Passed
            } else if (status === 'Passed' && updatedSteps.every(s => s.status === 'Passed') && detail.status !== 'Passed') {
                handleCaseUpdate('Passed');
            }
        } catch (error) {
            console.error("Failed to update step", error);
        }
    };

    const handleCaseUpdate = async (status: string) => {
        if (!detail) return;

        // Optimistic update
        setDetail(prev => prev ? { ...prev, status } : prev);

        try {
            await api.put(`/results/${detail.id}`, {
                status,
                jira_bug_id: jiraBugId || undefined,
                attachment_url: attachmentUrl || undefined,
                duration_ms: 1000 // mock
            });
            onUpdated();
        } catch (error) {
            console.error("Failed to update case result", error);
        }
    };

    const saveBugDetails = async () => {
        if (!detail) return;
        try {
            await api.put(`/results/${detail.id}`, {
                jira_bug_id: jiraBugId || undefined,
                attachment_url: attachmentUrl || undefined
            });
            alert('Bug details saved');
            onUpdated();
        } catch (error) {
            console.error("Failed to save bug details", error);
        }
    };

    if (!resultId) return null;

    return (
        <>
            {/* Slide-over */}
            <div
                ref={sidebarRef}
                style={{ width: `${width}px` }}
                className={`fixed top-0 right-0 h-full bg-white shadow-2xl z-40 flex flex-col transform transition-transform duration-300 ease-in-out border-l border-slate-200 ${isResizing ? 'transition-none' : ''}`}
            >
                {/* Resizer Handle */}
                <div
                    onMouseDown={startResizing}
                    className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize hover:bg-primary-300 active:bg-primary-500 z-50 opacity-0 hover:opacity-100 -translate-x-1/2 transition-opacity"
                />

                <div className="flex items-center justify-between p-6 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-md text-slate-500">
                            <X className="w-5 h-5" />
                        </button>
                        <h2 className="text-xl font-bold text-slate-900">Execute Test Case</h2>
                    </div>
                    {detail && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handleCaseUpdate('Passed')}
                                className={`px-4 py-2 rounded-md font-medium text-sm flex items-center gap-2 transition-colors ${detail.status === 'Passed' ? 'bg-green-600 text-white shadow-sm' : 'bg-green-50 text-green-700 hover:bg-green-100'
                                    }`}
                            >
                                <CheckCircle2 className="w-4 h-4" /> Pass All
                            </button>
                            <button
                                onClick={() => handleCaseUpdate('Failed')}
                                className={`px-4 py-2 rounded-md font-medium text-sm flex items-center gap-2 transition-colors ${detail.status === 'Failed' ? 'bg-red-600 text-white shadow-sm' : 'bg-red-50 text-red-700 hover:bg-red-100'
                                    }`}
                            >
                                <XCircle className="w-4 h-4" /> Fail
                            </button>
                            <button
                                onClick={() => handleCaseUpdate('Blocked')}
                                className={`px-4 py-2 rounded-md font-medium text-sm flex items-center gap-2 transition-colors ${detail.status === 'Blocked' ? 'bg-amber-500 text-white shadow-sm' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                    }`}
                            >
                                <Ban className="w-4 h-4" /> Blocked
                            </button>
                            {/* KQT-15381: Skip — mark a case intentionally not executed.
                                Result value is "Skipped" to match the backend enum and the
                                run-detail dropdown / progress accounting (KQT-15524). */}
                            <button
                                onClick={() => handleCaseUpdate('Skipped')}
                                className={`px-4 py-2 rounded-md font-medium text-sm flex items-center gap-2 transition-colors ${detail.status === 'Skipped' ? 'bg-slate-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                            >
                                <SkipForward className="w-4 h-4" /> Skip
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto bg-slate-50/50">
                    {isLoading || !detail ? (
                        <div className="flex items-center justify-center p-12">
                            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                        </div>
                    ) : (
                        <div className="p-6 space-y-6">
                            {/* Case Context */}
                            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="px-2.5 py-1 bg-primary-50 text-primary-700 text-xs font-semibold rounded uppercase tracking-wider">
                                        {caseLabel({ external_id: detail.test_case.external_id, id: detail.case_id })}
                                    </span>
                                    <span className={`px-2.5 py-1 text-xs font-semibold rounded uppercase tracking-wider ${detail.test_case.priority === 'High' ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-700'}`}>
                                        {detail.test_case.priority} priority
                                    </span>
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 mb-4">{detail.test_case.title}</h3>

                                {/* Metadata Badges */}
                                <div className="flex flex-wrap gap-x-4 gap-y-2 mb-4 p-3 bg-slate-50/50 rounded-lg border border-slate-100">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status:</span>
                                        <span className={`px-2 py-0.5 text-xs font-medium rounded-md ${detail.test_case.status === 'Active' ? 'bg-green-100 text-green-700' :
                                            detail.test_case.status === 'Draft' ? 'bg-slate-200 text-slate-700' :
                                                'bg-yellow-100 text-yellow-700'
                                            }`}>{detail.test_case.status}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Automation:</span>
                                        <span className="text-sm text-slate-700">{detail.test_case.automation_status}</span>
                                    </div>
                                    {detail.test_case.tags && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tags:</span>
                                            <div className="flex flex-wrap gap-1">
                                                {detail.test_case.tags.split(',').map((tag, idx) => (
                                                    <span key={idx} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-xs">{tag.trim()}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {detail.test_case.labels && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Labels:</span>
                                            <div className="flex flex-wrap gap-1">
                                                {detail.test_case.labels.split(',').map((label, idx) => (
                                                    <span key={idx} className="px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-100 rounded text-xs">{label.trim()}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {detail.assignee_id && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Assignee:</span>
                                            <span className="flex items-center gap-1.5 text-sm text-slate-700 font-medium">
                                                <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[10px] font-bold">
                                                    {(resolveAssignee(detail.assignee_id) || '?').charAt(0).toUpperCase()}
                                                </span>
                                                {resolveAssignee(detail.assignee_id)}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {detail.test_case.preconditions && (
                                    <div className="mb-4">
                                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Preconditions</h4>
                                        <div className="bg-slate-50 p-3 rounded-md border border-slate-100">
                                            {renderMarkdown(detail.test_case.preconditions)}
                                        </div>
                                    </div>
                                )}

                                {detail.test_case.description && (
                                    <div>
                                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Description</h4>
                                        <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-md border border-slate-100 whitespace-pre-wrap">{detail.test_case.description}</p>
                                    </div>
                                )}
                            </div>

                            {/* Steps Execution */}
                            <div>
                                <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-slate-400" />
                                    Test Steps ({detail.steps.length})
                                </h4>

                                {detail.steps.length === 0 ? (
                                    <div className="text-center p-8 bg-white border border-slate-200 border-dashed rounded-xl">
                                        <p className="text-sm text-slate-500">No steps defined for this test case.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {detail.steps.map((step, index) => (
                                            <div key={step.step_id} className={`bg-white border rounded-xl overflow-hidden transition-all ${step.status === 'Passed' ? 'border-green-200 shadow-sm shadow-green-100/50' :
                                                step.status === 'Failed' ? 'border-red-200 shadow-sm shadow-red-100/50' :
                                                step.status === 'Blocked' ? 'border-amber-200 shadow-sm shadow-amber-100/50' :
                                                    'border-slate-200'
                                                }`}>
                                                <div className="p-4 flex gap-4">
                                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-sm">
                                                        {index + 1}
                                                    </div>
                                                    <div className="flex-1 space-y-3">
                                                        <div>
                                                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Action</div>
                                                            <div className="text-sm text-slate-900">{renderMarkdown(step.action)}</div>
                                                        </div>
                                                        {step.data && (
                                                            <div>
                                                                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Data</div>
                                                                <code className="text-xs bg-slate-50 text-slate-700 px-2 py-1 rounded block whitespace-pre-wrap break-words">{step.data}</code>
                                                            </div>
                                                        )}
                                                        {step.expected_result && (
                                                            <div>
                                                                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Expected Result</div>
                                                                <div className="text-sm text-slate-600">{renderMarkdown(step.expected_result)}</div>
                                                            </div>
                                                        )}

                                                        {/* Actual Result Input (shown for all steps) */}
                                                        <div className="mt-4 p-3 bg-slate-50/50 border border-slate-100 rounded-lg">
                                                            <label className="text-xs font-semibold text-slate-600 mb-1.5 block">實際結果 (Actual Result)</label>
                                                            <textarea
                                                                value={step.actual_result || ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    setDetail(prev => prev ? {
                                                                        ...prev,
                                                                        steps: prev.steps.map(s => s.step_id === step.step_id ? { ...s, actual_result: val } : s)
                                                                    } : prev);
                                                                }}
                                                                onBlur={(e) => handleStepUpdate(step.step_id, step.status, e.target.value)}
                                                                className="w-full text-sm p-2 rounded-md border-slate-200 min-h-[60px] focus:ring-slate-500 focus:border-slate-500"
                                                                placeholder="Describe what actually happened..."
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex-shrink-0 flex flex-col gap-2">
                                                        <button
                                                            onClick={() => handleStepUpdate(step.step_id, 'Passed')}
                                                            title="Pass Step"
                                                            className={`p-2 rounded-md transition-colors ${step.status === 'Passed' ? 'bg-green-100 text-green-700' : 'bg-slate-50 text-slate-400 hover:bg-green-50 hover:text-green-600'}`}
                                                        >
                                                            <CheckCircle2 className="w-5 h-5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleStepUpdate(step.step_id, 'Failed')}
                                                            title="Fail Step"
                                                            className={`p-2 rounded-md transition-colors ${step.status === 'Failed' ? 'bg-red-100 text-red-700' : 'bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-600'}`}
                                                        >
                                                            <XCircle className="w-5 h-5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleStepUpdate(step.step_id, 'Blocked')}
                                                            title="Block Step"
                                                            className={`p-2 rounded-md transition-colors ${step.status === 'Blocked' ? 'bg-amber-100 text-amber-700' : 'bg-slate-50 text-slate-400 hover:bg-amber-50 hover:text-amber-600'}`}
                                                        >
                                                            <Ban className="w-5 h-5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Bug Report Section (Visible if any failure, or always visible) */}
                            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                                <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                                    <FileWarning className="w-4 h-4 text-orange-500" />
                                    Defect Tracking
                                </h4>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Jira Bug ID (e.g., PROJ-1234)</label>
                                        <input
                                            type="text"
                                            value={jiraBugId}
                                            onChange={(e) => setJiraBugId(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                                            placeholder="Link a bug"
                                        />
                                        {jiraBugId && (
                                            <div className="mt-1.5 pl-1 text-[13px]">
                                                <a
                                                    href={`https://kkday.atlassian.net/browse/${jiraBugId}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-primary-600 hover:text-primary-700 hover:underline inline-flex items-center gap-1"
                                                >
                                                    https://kkday.atlassian.net/browse/{jiraBugId}
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                                            <ImageIcon className="w-3.5 h-3.5" /> Attachment URL
                                        </label>
                                        <input
                                            type="text"
                                            value={attachmentUrl}
                                            onChange={(e) => setAttachmentUrl(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                                            placeholder="https://imgur.com/... or internal URL"
                                        />
                                        {attachmentUrl && (
                                            <div className="mt-3 relative h-32 w-full rounded-md overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
                                                <img src={attachmentUrl} alt="Attachment" className="max-h-full max-w-full object-contain" />
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={saveBugDetails}
                                        className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-md text-sm transition-colors"
                                    >
                                        Save Defect Details
                                    </button>
                                </div>
                            </div>

                            <div className="h-10"></div> {/* Spacer */}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
