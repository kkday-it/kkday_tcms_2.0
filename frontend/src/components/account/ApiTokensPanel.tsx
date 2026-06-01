/**
 * Personal API token management — list / create / revoke.
 *
 * Moved out of Settings.tsx into its own component so the new Account page
 * (帳號) can host it without duplicating the JSX. Keeping it under
 * `components/account/` because semantically it belongs to "my account",
 * not workspace settings (those are still Notifications / Appearance /
 * Users / System under Settings.tsx).
 *
 * Behaviour is identical to the previous Settings → API Tokens tab —
 * extraction only, no logic changes.
 */

import { useEffect, useState } from 'react';
import { Loader2, Plus, KeyRound, Copy, Trash2, CheckCircle2 } from 'lucide-react';
import api from '../../lib/api';
import { copyToClipboard } from '../../lib/clipboard';

interface ApiToken {
    id: number;
    label: string | null;
    created_at: string;
    last_used_at: string | null;
    expires_at: string | null;
}

export default function ApiTokensPanel() {
    const [tokens, setTokens] = useState<ApiToken[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    // Create form
    const [newLabel, setNewLabel] = useState('');
    const [expiresInDays, setExpiresInDays] = useState<string>('');
    const [isCreating, setIsCreating] = useState(false);
    // Raw token is returned once on creation — held here for the one-time reveal modal.
    const [revealedToken, setRevealedToken] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const fetchTokens = async () => {
        setIsLoading(true);
        setError('');
        try {
            const res = await api.get('/api-tokens/');
            setTokens(res.data);
        } catch (err: any) {
            setError(err?.response?.data?.detail?.message || err?.response?.data?.detail || '無法載入 API tokens');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchTokens(); }, []);

    const handleCreate = async () => {
        setIsCreating(true);
        setError('');
        try {
            const payload: { label?: string; expires_in_days?: number } = {};
            if (newLabel.trim()) payload.label = newLabel.trim();
            if (expiresInDays.trim()) {
                const days = Number(expiresInDays);
                if (!Number.isFinite(days) || days <= 0) {
                    setError('到期天數需為正整數，或留空表示永久');
                    setIsCreating(false);
                    return;
                }
                payload.expires_in_days = days;
            }
            const res = await api.post('/api-tokens/', payload);
            setRevealedToken(res.data.token);   // show once
            setNewLabel('');
            setExpiresInDays('');
            fetchTokens();
        } catch (err: any) {
            setError(err?.response?.data?.detail?.message || err?.response?.data?.detail || '產生 token 失敗');
        } finally {
            setIsCreating(false);
        }
    };

    const handleRevoke = async (id: number, label: string | null) => {
        if (!confirm(`確定撤銷 token「${label || `#${id}`}」？使用此 token 的程式會立即失效。`)) return;
        try {
            await api.delete(`/api-tokens/${id}`);
            fetchTokens();
        } catch (err: any) {
            alert(err?.response?.data?.detail?.message || err?.response?.data?.detail || '撤銷失敗');
        }
    };

    const copyToken = async () => {
        if (!revealedToken) return;
        // KQT-15399: helper handles HTTP-context fallback so the token reveal
        // copy button works on SIT (plain HTTP) too.
        if (await copyToClipboard(revealedToken)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const fmt = (s: string | null) => {
        if (!s) return '—';
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? s : d.toLocaleString();
    };

    return (
        <div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">API Tokens</h2>
            <p className="text-sm text-slate-500 mb-6">
                產生個人 API token 給 CLI / script / CI 使用。呼叫 API 時帶上 <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">Authorization: Bearer &lt;token&gt;</code>。Token 只在建立當下顯示一次。
            </p>

            {/* Create */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">產生新 Token</h3>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                    <div className="flex-1">
                        <label className="block text-xs font-medium text-slate-600 mb-1">名稱（選填）</label>
                        <input
                            type="text"
                            value={newLabel}
                            onChange={e => setNewLabel(e.target.value)}
                            placeholder="例：ci-bot、my-laptop"
                            className="w-full text-sm rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                    </div>
                    <div className="w-full sm:w-40">
                        <label className="block text-xs font-medium text-slate-600 mb-1">到期天數（留空=永久）</label>
                        <input
                            type="number"
                            min="1"
                            value={expiresInDays}
                            onChange={e => setExpiresInDays(e.target.value)}
                            placeholder="例：30"
                            className="w-full text-sm rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                    </div>
                    <button
                        onClick={handleCreate}
                        disabled={isCreating}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-md hover:bg-primary-700 disabled:opacity-50 whitespace-nowrap"
                    >
                        {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        產生
                    </button>
                </div>
                {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            </div>

            {/* List */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                ) : tokens.length === 0 ? (
                    <p className="p-6 text-sm text-slate-400 italic">尚無 token。</p>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                            <tr>
                                <th className="px-6 py-3 font-medium">名稱</th>
                                <th className="px-4 py-3 font-medium">建立時間</th>
                                <th className="px-4 py-3 font-medium">最後使用</th>
                                <th className="px-4 py-3 font-medium">到期</th>
                                <th className="px-4 py-3 font-medium w-16"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {tokens.map(t => (
                                <tr key={t.id} className="hover:bg-slate-50/80">
                                    <td className="px-6 py-3 font-medium text-slate-900">{t.label || <span className="text-slate-400">（未命名）</span>}</td>
                                    <td className="px-4 py-3 text-slate-600">{fmt(t.created_at)}</td>
                                    <td className="px-4 py-3 text-slate-600">{fmt(t.last_used_at)}</td>
                                    <td className="px-4 py-3 text-slate-600">{t.expires_at ? fmt(t.expires_at) : <span className="text-emerald-600">永久</span>}</td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => handleRevoke(t.id, t.label)}
                                            title="撤銷"
                                            className="text-slate-400 hover:text-red-600 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* One-time reveal modal */}
            {revealedToken && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
                        <div className="flex items-start gap-3 mb-4">
                            <KeyRound className="w-5 h-5 text-primary-600 mt-0.5 shrink-0" />
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Token 已建立</h3>
                                <p className="text-sm text-amber-600 mt-1">⚠️ 此 token 只會顯示這一次，請立即複製保存。關閉後無法再看到。</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md p-3 mb-4">
                            <code className="flex-1 text-xs font-mono text-slate-800 break-all">{revealedToken}</code>
                            <button
                                onClick={copyToken}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-medium hover:bg-slate-100 shrink-0"
                            >
                                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                {copied ? '已複製' : '複製'}
                            </button>
                        </div>
                        <div className="flex justify-end">
                            <button
                                onClick={() => { setRevealedToken(null); setCopied(false); }}
                                className="px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-md hover:bg-primary-700"
                            >
                                我已保存，關閉
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
