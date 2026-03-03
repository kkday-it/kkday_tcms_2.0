import { useState } from 'react';
import { User, Shield, Loader2, Plus } from 'lucide-react';
import api from '../lib/api';
import { useUsers } from '../lib/useUsers';

export interface AppUser {
    id: number;
    username: string;
    email: string;
    role: string;
}

export default function Users() {
    const { users, isLoading, refresh } = useUsers();
    const [isAddOpen, setIsAddOpen] = useState(false);

    // Check if current user is admin
    const currentUserJson = localStorage.getItem('tcms_user');
    const currentUser = currentUserJson ? JSON.parse(currentUserJson) : null;
    const isAdmin = currentUser?.role === 'Admin';
    const [newUsername, setNewUsername] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newRole, setNewRole] = useState('QA');

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/users/', {
                username: newUsername,
                email: newEmail,
                role: newRole
            });
            setIsAddOpen(false);
            setNewUsername('');
            setNewEmail('');
            setNewRole('QA');
            refresh();
        } catch (error) {
            console.error("Failed to create user", error);
            alert("Failed to create user. Email or username might already exist.");
        }
    };

    const handleResetPassword = async (userId: number, username: string) => {
        if (!window.confirm(`Are you sure you want to reset ${username}'s password to '1234'?`)) return;
        try {
            await api.post(`/users/${userId}/reset-default`);
            alert(`Password for ${username} reset to '1234'. They will be forced to change it on next login.`);
        } catch (error) {
            console.error("Failed to reset password", error);
            alert("Failed to reset password.");
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
            <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                        <User className="w-5 h-5 text-primary-600" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 leading-tight">Users & Roles</h1>
                        <p className="text-sm text-slate-500">Manage team members and their permissions.</p>
                    </div>
                </div>
                <button
                    onClick={() => setIsAddOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-sm font-medium"
                >
                    <Plus className="w-4 h-4" />
                    Add User
                </button>
            </header>

            <div className="flex-1 overflow-y-auto p-6">
                {isLoading ? (
                    <div className="flex items-center justify-center h-32">
                        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                    </div>
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
                                ) : (
                                    users.map(u => (
                                        <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-bold text-sm">
                                                        {u.username.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-bold text-slate-900">{u.username}</div>
                                                        <div className="text-xs text-slate-500">{u.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border ${u.role === 'Admin' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                    u.role === 'QA' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                        u.role === 'RD' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                            'bg-slate-100 text-slate-700 border-slate-200'
                                                    }`}>
                                                    <Shield className="w-3 h-3" />
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right space-x-3">
                                                {isAdmin && (
                                                    <button
                                                        onClick={() => handleResetPassword(u.id, u.username)}
                                                        className="text-sm text-orange-600 hover:text-orange-700 font-medium"
                                                    >
                                                        Reset PW
                                                    </button>
                                                )}
                                                <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">Edit</button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Add User Modal */}
            {isAddOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-4 border-b border-slate-100">
                            <h2 className="text-lg font-bold text-slate-900">Add New User</h2>
                        </div>
                        <div className="p-4 flex-1 overflow-y-auto">
                            <form onSubmit={handleAddUser} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                                    <input
                                        type="text"
                                        required
                                        value={newUsername}
                                        onChange={(e) => setNewUsername(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                    <input
                                        type="email"
                                        required
                                        value={newEmail}
                                        onChange={(e) => setNewEmail(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                                    <select
                                        value={newRole}
                                        onChange={(e) => setNewRole(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    >
                                        <option value="Admin">Admin</option>
                                        <option value="QA">QA</option>
                                        <option value="RD">RD</option>
                                        <option value="Tester">Tester</option>
                                    </select>
                                </div>
                                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsAddOpen(false)}
                                        className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
                                    >
                                        Add User
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
