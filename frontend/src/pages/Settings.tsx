import { useState, useEffect } from 'react';
import { Shield, Loader2, Plus, X, Save, Users, Bell, Palette, Database, Download, CheckCircle2 } from 'lucide-react';
import api from '../lib/api';

export interface AppUser {
    id: number;
    username: string;
    full_name: string;
    email: string;
    role: string;
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
    const [users, setUsers] = useState<AppUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editUser, setEditUser] = useState<AppUser | null>(null);
    const [isAddOpen, setIsAddOpen] = useState(false);

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const res = await api.get('/users/');
            setUsers(res.data);
        } catch (err) { console.error('Failed to fetch users', err); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { fetchUsers(); }, []);

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

            {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSaved={fetchUsers} />}
            {isAddOpen && <AddUserModal onClose={() => setIsAddOpen(false)} onSaved={fetchUsers} />}
        </div>
    );
}

// --- System Tab (Backup) ---
function SystemTab() {
    const projectId = 1;
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [lastBackup, setLastBackup] = useState<string | null>(
        localStorage.getItem('tcms_last_backup')
    );

    const handleBackup = async () => {
        setIsBackingUp(true);
        try {
            const response = await api.get(`/backup?project_id=${projectId}`, { responseType: 'blob' });
            const url = URL.createObjectURL(response.data);
            const a = document.createElement('a');
            a.href = url;
            const now = new Date();
            const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
            a.download = `tcms_backup_${ts}.zip`;
            a.click();
            URL.revokeObjectURL(url);
            const timeStr = now.toLocaleString();
            setLastBackup(timeStr);
            localStorage.setItem('tcms_last_backup', timeStr);
        } catch (err) {
            console.error('Backup failed:', err);
            alert('Backup failed. Please try again.');
        } finally {
            setIsBackingUp(false);
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
                            <p className="text-sm text-slate-500">匯出所有 Test Cases、Runs、Plans 及 Dashboard 統計為 ZIP 檔案</p>
                        </div>
                    </div>
                </div>
                <div className="px-6 py-5">
                    <div className="flex items-center justify-between mb-5">
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-slate-700">備份內容</p>
                            <ul className="text-sm text-slate-500 space-y-0.5 list-disc list-inside">
                                <li><code className="text-xs bg-slate-100 px-1 rounded">cases.json</code> — 所有 Test Cases（含步驟）</li>
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
        </div>
    );
}

// --- Settings Page ---
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
                        <SystemTab />
                    )}
                </div>
            </div>
        </div>
    );
}
