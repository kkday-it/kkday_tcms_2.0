import { useState, useEffect, useRef } from 'react';
import { Shield, Loader2, Plus, X, Save, Users, Bell, Palette, Database, Download, Upload, CheckCircle2, AlertCircle, Clock, Play, FileArchive } from 'lucide-react';
import api from '../lib/api';
import { useUsers } from '../lib/useUsers';

export interface AppUser {
    id: number;
    username: string;
    full_name?: string;
    email?: string;
    role?: string;
}

// --- Edit User Modal ---
function EditUserModal({ user, onClose, onSaved }: { user: AppUser; onClose: () => void; onSaved: () => void }) {
    const [username, setUsername] = useState(user.username);
    const [fullName, setFullName] = useState(user.full_name || '');
    const [email, setEmail] = useState(user.email);
    const [role, setRole] = useState(user.role);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await api.put(`/users/${user.id}`, { username, full_name: fullName, email, role });
            onSaved();
            onClose();
        } catch (err) {
            console.error('Failed to update user', err);
            alert('Failed to update user.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-900">Edit User</h2>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <form onSubmit={handleSave} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                        <input type="text" required value={username} onChange={e => setUsername(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                        <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                        <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                        <select value={role} onChange={e => setRole(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white">
                            <option value="Admin">Admin</option>
                            <option value="QA">QA</option>
                            <option value="RD">RD</option>
                            <option value="Tester">Tester</option>
                        </select>
                    </div>
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                        <button type="button" onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                            Cancel
                        </button>
                        <button type="submit" disabled={isSubmitting}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shadow-sm disabled:opacity-70">
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// --- Add User Modal ---
function AddUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const [username, setUsername] = useState('');
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('QA');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await api.post('/users/', { username, full_name: fullName, email, role });
            onSaved();
            onClose();
        } catch (err) {
            console.error('Failed to add user', err);
            alert('Failed to create user. Email or username might already exist.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-900">Add New User</h2>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <form onSubmit={handleAdd} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                        <input type="text" required value={username} onChange={e => setUsername(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                        <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                        <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                        <select value={role} onChange={e => setRole(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white">
                            <option value="Admin">Admin</option>
                            <option value="QA">QA</option>
                            <option value="RD">RD</option>
                            <option value="Tester">Tester</option>
                        </select>
                    </div>
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                        <button type="button" onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                            Cancel
                        </button>
                        <button type="submit" disabled={isSubmitting}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shadow-sm disabled:opacity-70">
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Add User
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// --- User Management Tab ---
function UsersTab({ isAdmin }: { isAdmin: boolean }) {
    const { users, isLoading, refresh } = useUsers();
    const [editUser, setEditUser] = useState<AppUser | null>(null);
    const [isAddOpen, setIsAddOpen] = useState(false);

    const handleResetPassword = async (userId: number, username: string) => {
        if (!window.confirm(`Reset ${username}'s password to '1234'?`)) return;
        try {
            await api.post(`/users/${userId}/reset-default`);
            alert(`Password reset for ${username}. They will be forced to change it on next login.`);
        } catch { alert('Failed to reset password.'); }
    };

    if (!isAdmin) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
                <Shield className="w-12 h-12 text-slate-200" />
                <p className="text-base font-medium text-slate-500">Admin access required</p>
                <p className="text-sm">You don't have permission to manage users.</p>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">User Management</h2>
                    <p className="text-sm text-slate-500 mt-1">Manage team members, roles, and access permissions.</p>
                </div>
                <button onClick={() => setIsAddOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors shadow-sm">
                    <Plus className="w-4 h-4" /> Add User
                </button>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {users.length === 0 ? (
                                <tr><td colSpan={3} className="px-6 py-8 text-center text-sm text-slate-400">No users found</td></tr>
                            ) : users.map(u => (
                                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm shrink-0">
                                                {u.username.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-slate-900">{u.full_name || u.username}</div>
                                                <div className="text-xs text-slate-500">{u.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${u.role === 'Admin' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                            u.role === 'QA' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                u.role === 'RD' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                    'bg-slate-100 text-slate-700 border-slate-200'
                                            }`}>
                                            <Shield className="w-3 h-3" />{u.role}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-3">
                                        <button onClick={() => handleResetPassword(u.id, u.username)}
                                            className="text-sm text-orange-600 hover:text-orange-700 font-medium">
                                            Reset PW
                                        </button>
                                        <button onClick={() => setEditUser(u)}
                                            className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                                            Edit
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSaved={refresh} />}
            {isAddOpen && <AddUserModal onClose={() => setIsAddOpen(false)} onSaved={refresh} />}
        </div>
    );
}

// --- System Tab (Backup & Restore) ---
function SystemTab() {
    const projectId = 1;
    const restoreInputRef = useRef<HTMLInputElement>(null);

    // Backup state
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [lastBackup, setLastBackup] = useState<string | null>(
        localStorage.getItem('tcms_last_backup')
    );

    // Restore state
    const [isRestoring, setIsRestoring] = useState(false);
    const [restoreResult, setRestoreResult] = useState<{
        status: 'success' | 'error';
        message?: string;
        imported?: Record<string, number>;
        skipped_count?: number;
    } | null>(null);

    const handleBackup = async () => {
        setIsBackingUp(true);
        try {
            const response = await api.get(`/backup?project_id=${projectId}`, { responseType: 'blob' });
            const url = URL.createObjectURL(response.data);
            const a = document.createElement('a');
            a.href = url;
            const disposition = (response.headers as Record<string, string>)['content-disposition'] || '';
            const match = disposition.match(/filename\*?=(?:UTF-8'')?(?:"([^"]+)"|([^;]+))/i);
            const raw = (match?.[1] || match?.[2] || '').trim();
            let parsed = raw;
            try { parsed = decodeURIComponent(raw); } catch { /* fall back to raw if percent-decode fails */ }
            a.download = parsed || 'tcms_backup.zip';
            a.click();
            URL.revokeObjectURL(url);
            const timeStr = new Date().toLocaleString();
            setLastBackup(timeStr);
            localStorage.setItem('tcms_last_backup', timeStr);
        } catch (err) {
            console.error('Backup failed:', err);
            alert('Backup failed. Please try again.');
        } finally {
            setIsBackingUp(false);
        }
    };

    const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.name.endsWith('.zip')) {
            setRestoreResult({ status: 'error', message: '請選擇 .zip 備份檔案' });
            return;
        }
        setIsRestoring(true);
        setRestoreResult(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await api.post(`/backup/restore?project_id=${projectId}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setRestoreResult({
                status: 'success',
                imported: res.data.imported,
                skipped_count: res.data.skipped_count,
            });
        } catch (err: any) {
            const detail = err?.response?.data?.detail || '還原失敗，請確認備份檔案格式正確';
            setRestoreResult({ status: 'error', message: detail });
        } finally {
            setIsRestoring(false);
            if (restoreInputRef.current) restoreInputRef.current.value = '';
        }
    };

    return (
        <div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">System</h2>
            <p className="text-sm text-slate-500 mb-6">System-wide configurations. Admin only.</p>

            {/* Backup Card */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm mb-6">
                <div className="px-6 py-5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                            <Database className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-900">One-Click Backup</h3>
                            <p className="text-sm text-slate-500">匯出所有 Suites、Cases、Runs、Plans 及 Dashboard 統計為 ZIP 檔案</p>
                        </div>
                    </div>
                </div>
                <div className="px-6 py-5">
                    <div className="flex items-center justify-between mb-5">
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-slate-700">備份內容</p>
                            <ul className="text-sm text-slate-500 space-y-0.5 list-disc list-inside">
                                <li><code className="text-xs bg-slate-100 px-1 rounded">suites.json</code> — Suite 階層結構</li>
                                <li><code className="text-xs bg-slate-100 px-1 rounded">cases.json</code> — 所有 Test Cases（含步驟，可還原）</li>
                                <li><code className="text-xs bg-slate-100 px-1 rounded">cases_ai.json</code> — AI 格式（供向量資料庫使用）</li>
                                <li><code className="text-xs bg-slate-100 px-1 rounded">runs.json</code> — 所有 Test Runs（含執行結果）</li>
                                <li><code className="text-xs bg-slate-100 px-1 rounded">plans.json</code> — 所有 Test Plans（含關聯）</li>
                                <li><code className="text-xs bg-slate-100 px-1 rounded">dashboard.json</code> — Dashboard 統計摘要</li>
                                <li><code className="text-xs bg-slate-100 px-1 rounded">manifest.json</code> — 備份 metadata</li>
                            </ul>
                        </div>
                        <button
                            onClick={handleBackup}
                            disabled={isBackingUp}
                            className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors shadow-sm disabled:opacity-70 shrink-0 ml-6"
                        >
                            {isBackingUp
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Backing up...</>
                                : <><Download className="w-4 h-4" /> Download Backup</>
                            }
                        </button>
                    </div>
                    {lastBackup && (
                        <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            上次備份時間：{lastBackup}
                        </div>
                    )}
                </div>
            </div>

            {/* Restore Card */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="px-6 py-5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                            <Upload className="w-5 h-5 text-amber-500" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-900">Restore from Backup</h3>
                            <p className="text-sm text-slate-500">上傳 ZIP 備份檔案還原資料（相同名稱的項目會自動跳過，不會重複建立）</p>
                        </div>
                    </div>
                </div>
                <div className="px-6 py-5">
                    <input
                        ref={restoreInputRef}
                        type="file"
                        accept=".zip"
                        style={{ display: 'none' }}
                        onChange={handleRestoreFile}
                    />
                    <div className="flex items-center gap-4 mb-4">
                        <button
                            onClick={() => restoreInputRef.current?.click()}
                            disabled={isRestoring}
                            className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors shadow-sm disabled:opacity-70"
                        >
                            {isRestoring
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Restoring...</>
                                : <><Upload className="w-4 h-4" /> Select Backup File</>
                            }
                        </button>
                        <p className="text-xs text-slate-400">接受 .zip 備份檔</p>
                    </div>

                    {/* Restore Result */}
                    {restoreResult && (
                        restoreResult.status === 'success' ? (
                            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-3 text-emerald-700 font-semibold">
                                    <CheckCircle2 className="w-4 h-4" /> 還原成功
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    {Object.entries(restoreResult.imported || {}).map(([key, val]) => (
                                        <div key={key} className="bg-white border border-emerald-100 rounded-lg px-3 py-2 text-center">
                                            <div className="text-lg font-bold text-emerald-600">{val}</div>
                                            <div className="text-xs text-slate-500 capitalize">{key}</div>
                                        </div>
                                    ))}
                                </div>
                                {(restoreResult.skipped_count ?? 0) > 0 && (
                                    <p className="text-xs text-slate-500 mt-3">
                                        另有 {restoreResult.skipped_count} 個項目因已存在而跳過
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-lg px-4 py-3 text-sm text-rose-700">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                {restoreResult.message}
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Schedule Presets ───────────────────────────────────────────────────────────
const CRON_PRESETS = [
    { label: 'Every 6 hours',  type: 'cron', value: '0 */6 * * *' },
    { label: 'Every 12 hours', type: 'cron', value: '0 */12 * * *' },
    { label: 'Daily at 2 AM',  type: 'cron', value: '0 2 * * *' },
    { label: 'Daily at 9 AM',  type: 'cron', value: '0 9 * * *' },
    { label: 'Weekly (Mon 2 AM)', type: 'cron', value: '0 2 * * 1' },
    { label: 'Custom Cron…',  type: 'cron', value: '__custom__' },
];

// ── Scheduled Backup Card ─────────────────────────────────────────────────────
function ScheduledBackupCard() {
    const [cfg, setCfg] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [runningNow, setRunningNow] = useState(false);
    const [presetValue, setPresetValue] = useState('0 2 * * *');
    const [customCron, setCustomCron] = useState('');
    const [scheduleType, setScheduleType] = useState<'cron' | 'interval'>('cron');
    const [intervalHours, setIntervalHours] = useState(24);
    const [keepN, setKeepN] = useState(10);
    const [enabled, setEnabled] = useState(false);

    const fetchCfg = async () => {
        try {
            const res = await api.get('/backup/schedule');
            const data = res.data;
            setCfg(data);
            setEnabled(data.enabled ?? false);
            setScheduleType(data.schedule_type ?? 'cron');
            setIntervalHours(data.interval_hours ?? 24);
            setKeepN(data.keep_last_n ?? 10);
            const expr = data.cron_expression ?? '0 2 * * *';
            const preset = CRON_PRESETS.find(p => p.value === expr && p.value !== '__custom__');
            if (preset) { setPresetValue(expr); setCustomCron(''); }
            else { setPresetValue('__custom__'); setCustomCron(expr); }
        } catch { /* ignore */ }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchCfg(); }, []);

    const effectiveCron = presetValue === '__custom__' ? customCron : presetValue;

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put('/backup/schedule', {
                enabled,
                schedule_type: scheduleType,
                cron_expression: effectiveCron,
                interval_hours: intervalHours,
                keep_last_n: keepN,
            });
            await fetchCfg();
        } catch { alert('Save failed'); }
        finally { setSaving(false); }
    };

    const handleRunNow = async () => {
        setRunningNow(true);
        try {
            await api.post('/backup/schedule/run-now');
            setTimeout(fetchCfg, 3000);
        } catch { alert('Failed to trigger backup'); }
        finally { setTimeout(() => setRunningNow(false), 2000); }
    };

    const handleDownload = async (filename: string) => {
        const res = await api.get(`/backup/schedule/files/${filename}`, { responseType: 'blob' });
        const url = URL.createObjectURL(res.data);
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    };

    const fmtTime = (iso: string | null) => iso ? new Date(iso).toLocaleString() : '—';

    if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>;

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm mb-6">
            <div className="px-6 py-5 border-b border-slate-100">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-violet-500" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-900">Scheduled Backup</h3>
                            <p className="text-sm text-slate-500">定期自動備份，類似 Jenkins 排程建置</p>
                        </div>
                    </div>
                    {/* Enable Toggle */}
                    <button
                        onClick={() => setEnabled(v => !v)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-primary-600' : 'bg-slate-300'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
            </div>

            <div className="px-6 py-5 space-y-5">
                {/* Schedule Config */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Type */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Schedule Type</label>
                        <div className="flex gap-2">
                            {(['cron', 'interval'] as const).map(t => (
                                <button key={t} onClick={() => setScheduleType(t)}
                                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${scheduleType === t ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:border-primary-300'}`}>
                                    {t === 'cron' ? 'Cron' : 'Interval'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Cron / Interval */}
                    {scheduleType === 'cron' ? (
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Schedule</label>
                            <select value={presetValue} onChange={e => setPresetValue(e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
                                {CRON_PRESETS.map(p => (
                                    <option key={p.value} value={p.value}>{p.label}</option>
                                ))}
                            </select>
                            {presetValue === '__custom__' && (
                                <input type="text" placeholder="e.g. 0 2 * * *" value={customCron}
                                    onChange={e => setCustomCron(e.target.value)}
                                    className="mt-2 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono" />
                            )}
                        </div>
                    ) : (
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Every (hours)</label>
                            <input type="number" min={1} max={168} value={intervalHours}
                                onChange={e => setIntervalHours(Number(e.target.value))}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                        </div>
                    )}
                </div>

                {/* Keep N */}
                <div className="flex items-center gap-4">
                    <div className="flex-1">
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Keep last N backups</label>
                        <input type="number" min={1} max={50} value={keepN}
                            onChange={e => setKeepN(Number(e.target.value))}
                            className="w-32 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div className="flex gap-2 pt-5">
                        <button onClick={handleRunNow} disabled={runningNow}
                            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors">
                            {runningNow ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            Run Now
                        </button>
                        <button onClick={handleSave} disabled={saving}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60 transition-colors">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save
                        </button>
                    </div>
                </div>

                {/* Status */}
                {cfg && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="bg-slate-50 rounded-lg px-4 py-3">
                            <p className="text-xs text-slate-500 mb-0.5">Last Run</p>
                            <p className={`text-sm font-medium ${cfg.last_run_status === 'error' ? 'text-rose-600' : 'text-slate-800'}`}>
                                {fmtTime(cfg.last_run)}
                                {cfg.last_run_status === 'error' && <span className="ml-1 text-xs text-rose-500">(failed)</span>}
                            </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg px-4 py-3">
                            <p className="text-xs text-slate-500 mb-0.5">Next Run</p>
                            <p className="text-sm font-medium text-slate-800">{fmtTime(cfg.next_run)}</p>
                        </div>
                    </div>
                )}

                {/* Run History */}
                {cfg?.run_history?.length > 0 && (
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Recent History</p>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                            {cfg.run_history.map((h: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-slate-50">
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${h.status === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                    <span className="text-slate-500 shrink-0">{new Date(h.time).toLocaleString()}</span>
                                    <span className="text-slate-700 truncate">{h.detail}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Backup Files */}
                {cfg?.backup_files?.length > 0 && (
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Stored Backups ({cfg.backup_files.length})</p>
                        <div className="space-y-1 max-h-48 overflow-y-auto border border-slate-100 rounded-lg">
                            {cfg.backup_files.map((f: any) => (
                                <div key={f.filename} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 text-sm">
                                    <div className="flex items-center gap-2 truncate">
                                        <FileArchive className="w-4 h-4 text-slate-400 shrink-0" />
                                        <span className="truncate text-slate-700">{f.filename}</span>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0 ml-2">
                                        <span className="text-xs text-slate-400">{f.size_kb} KB</span>
                                        <button onClick={() => handleDownload(f.filename)}
                                            className="text-primary-600 hover:text-primary-700">
                                            <Download className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// --- Settings Page ---

// API Tokens moved out of Settings — it belongs to /account (per-user resource,
// not a workspace setting). See pages/Account.tsx + components/account/ApiTokensPanel.tsx.
type SettingsTab = 'users' | 'notifications' | 'appearance' | 'system';

const TABS: { id: SettingsTab; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
    { id: 'users', label: 'User Management', icon: Users, adminOnly: true },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'system', label: 'System', icon: Database, adminOnly: true },
];

export default function Settings() {
    const currentUserJson = localStorage.getItem('tcms_user');
    const currentUser = currentUserJson ? JSON.parse(currentUserJson) : null;
    const isAdmin = currentUser?.role === 'Admin';

    const [activeTab, setActiveTab] = useState<SettingsTab>(isAdmin ? 'users' : 'notifications');

    const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin);

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 px-8 py-5 shrink-0">
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Settings</h1>
                <p className="text-sm text-slate-500 mt-1">Configure your workspace and manage users.</p>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Left Sidebar */}
                <nav className="w-56 shrink-0 bg-white border-r border-slate-200 p-4 flex flex-col gap-1">
                    {visibleTabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${activeTab === tab.id
                                ? 'bg-primary-50 text-primary-700 font-semibold'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                        >
                            <tab.icon className="w-4 h-4 shrink-0" />
                            {tab.label}
                            {tab.adminOnly && (
                                <span className="ml-auto text-[10px] font-bold uppercase text-purple-500 bg-purple-50 px-1.5 py-0.5 rounded">Admin</span>
                            )}
                        </button>
                    ))}
                </nav>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8">
                    {activeTab === 'users' && <UsersTab isAdmin={isAdmin} />}

                    {activeTab === 'notifications' && (
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 mb-2">Notifications</h2>
                            <p className="text-sm text-slate-500 mb-6">Configure how you receive notifications.</p>
                            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                                <p className="text-sm text-slate-400 italic">Notification settings coming soon...</p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'appearance' && (
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 mb-2">Appearance</h2>
                            <p className="text-sm text-slate-500 mb-6">Customize the look and feel of the application.</p>
                            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                                <p className="text-sm text-slate-400 italic">Appearance settings coming soon...</p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'system' && isAdmin && (
                        <>
                            <SystemTab />
                            <ScheduledBackupCard />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
