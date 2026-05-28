import { useEffect, useMemo, useState } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
import SearchableSelect, { SearchableOption } from '../common/SearchableSelect';

// Lightweight projection of TestSuite — only the fields we need to render the
// "current folder" name and build the suite picker.
interface SuiteLike {
    id: number;
    name: string;
    parent_suite_id?: number | null;
}

export type ExportFormat = 'csv' | 'json' | 'ai_json';
export type ExportScope =
    | { kind: 'all' }
    | { kind: 'active' }                 // limit to the currently-active suite in the sidebar
    | { kind: 'pick'; suiteId: number }; // limit to an explicitly picked suite

interface ExportCasesModalProps {
    isOpen: boolean;
    onClose: () => void;
    activeSuiteId: number | null;
    suites: SuiteLike[];
    isExporting: boolean;
    onConfirm: (format: ExportFormat, scope: ExportScope) => void;
}

export default function ExportCasesModal({
    isOpen,
    onClose,
    activeSuiteId,
    suites,
    isExporting,
    onConfirm,
}: ExportCasesModalProps) {
    // Default scope: "active" if a folder is active in the sidebar, otherwise "all".
    // This preserves the previous implicit behavior while making it explicit + overridable.
    const [scope, setScope] = useState<ExportScope>(
        activeSuiteId != null ? { kind: 'active' } : { kind: 'all' }
    );
    const [format, setFormat] = useState<ExportFormat>('csv');
    const [pickedSuiteId, setPickedSuiteId] = useState<number | ''>('');

    useEffect(() => {
        if (isOpen) {
            setScope(activeSuiteId != null ? { kind: 'active' } : { kind: 'all' });
            setFormat('csv');
            setPickedSuiteId('');
        }
    }, [isOpen, activeSuiteId]);

    // Suite picker — same full-path label pattern as the EditXFolderModal pickers
    // (intentional, after the 2026-05-28 UX feedback about flat folder labels).
    const suiteOptions = useMemo<SearchableOption[]>(() => {
        const byId = new Map(suites.map(s => [s.id, s]));
        const pathOf = (id: number): string[] => {
            const out: string[] = [];
            let cur = byId.get(id);
            const seen = new Set<number>();
            while (cur && !seen.has(cur.id)) {
                seen.add(cur.id);
                out.unshift(cur.name);
                cur = cur.parent_suite_id != null ? byId.get(cur.parent_suite_id) : undefined;
            }
            return out;
        };
        return suites
            .map(s => ({ value: s.id, label: pathOf(s.id).join(' / ') } satisfies SearchableOption))
            .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));
    }, [suites]);

    const activeSuiteName = activeSuiteId != null
        ? suites.find(s => s.id === activeSuiteId)?.name ?? `Suite #${activeSuiteId}`
        : null;

    if (!isOpen) return null;

    const canConfirm = !isExporting && (scope.kind !== 'pick' || pickedSuiteId !== '');

    const handleConfirm = () => {
        if (!canConfirm) return;
        const resolved: ExportScope =
            scope.kind === 'pick'
                ? { kind: 'pick', suiteId: Number(pickedSuiteId) }
                : scope;
        onConfirm(format, resolved);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                        <Download className="w-5 h-5 text-primary-600" /> 匯出測試案例
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-100 rounded-md">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Scope */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">匯出範圍</label>
                        <div className="space-y-2">
                            <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer ${scope.kind === 'all' ? 'bg-primary-50 border-primary-300' : 'border-slate-200 hover:border-slate-300'}`}>
                                <input
                                    type="radio"
                                    name="scope"
                                    checked={scope.kind === 'all'}
                                    onChange={() => setScope({ kind: 'all' })}
                                    className="accent-primary-600"
                                />
                                <span className="text-sm">全部測試案例(整個 project)</span>
                            </label>

                            <label
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer ${activeSuiteId == null ? 'opacity-50 cursor-not-allowed' : ''} ${scope.kind === 'active' ? 'bg-primary-50 border-primary-300' : 'border-slate-200 hover:border-slate-300'}`}
                            >
                                <input
                                    type="radio"
                                    name="scope"
                                    checked={scope.kind === 'active'}
                                    disabled={activeSuiteId == null}
                                    onChange={() => setScope({ kind: 'active' })}
                                    className="accent-primary-600"
                                />
                                <span className="text-sm">
                                    目前資料夾
                                    {activeSuiteName
                                        ? <span className="ml-1.5 text-slate-500 font-mono text-xs">({activeSuiteName} + 其子資料夾)</span>
                                        : <span className="ml-1.5 text-slate-400 text-xs">(請先在左側選一個資料夾)</span>}
                                </span>
                            </label>

                            <label className={`flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer ${scope.kind === 'pick' ? 'bg-primary-50 border-primary-300' : 'border-slate-200 hover:border-slate-300'}`}>
                                <input
                                    type="radio"
                                    name="scope"
                                    checked={scope.kind === 'pick'}
                                    onChange={() => setScope({ kind: 'pick', suiteId: 0 })}
                                    className="accent-primary-600 mt-1"
                                />
                                <div className="flex-1">
                                    <span className="text-sm">指定資料夾</span>
                                    {scope.kind === 'pick' && (
                                        <div className="mt-2">
                                            <SearchableSelect
                                                value={pickedSuiteId}
                                                onChange={v => setPickedSuiteId(v === '' ? '' : Number(v))}
                                                options={suiteOptions}
                                                placeholder="搜尋資料夾..."
                                                ariaLabel="Pick suite to export"
                                            />
                                            <p className="text-xs text-slate-500 mt-1.5">含子資料夾內所有案例。</p>
                                        </div>
                                    )}
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Format */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">格式</label>
                        <div className="flex gap-2">
                            {([
                                { v: 'csv', label: 'CSV', desc: 'Excel 試算表' },
                                { v: 'json', label: 'JSON', desc: '系統整合' },
                                { v: 'ai_json', label: 'AI JSON', desc: '向量資料庫' },
                            ] as { v: ExportFormat; label: string; desc: string }[]).map(o => (
                                <button
                                    key={o.v}
                                    type="button"
                                    onClick={() => setFormat(o.v)}
                                    className={`flex-1 px-3 py-2 rounded-lg border text-left transition-colors ${format === o.v ? 'bg-primary-50 border-primary-400' : 'border-slate-200 hover:border-slate-300'}`}
                                >
                                    <div className="text-sm font-semibold text-slate-800">{o.label}</div>
                                    <div className="text-xs text-slate-500 mt-0.5">{o.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isExporting}
                        className="px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={!canConfirm}
                        className="btn-primary flex items-center gap-2 min-w-[120px] justify-center disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isExporting
                            ? (<><Loader2 className="w-4 h-4 animate-spin" /> 匯出中...</>)
                            : (<><Download className="w-4 h-4" /> 開始匯出</>)}
                    </button>
                </div>
            </div>
        </div>
    );
}
