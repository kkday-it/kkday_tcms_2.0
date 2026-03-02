import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Presentation, Layers, Activity, Settings as SettingsIcon, User, ClipboardList, LogOut } from 'lucide-react';

export default function MainLayout() {
    const location = useLocation();
    const navigate = useNavigate();

    // Get the current user from local storage
    const currentUserJson = localStorage.getItem('tcms_user');
    const currentUser = currentUserJson ? JSON.parse(currentUserJson) : null;
    const isAdmin = currentUser?.role === 'Admin';

    const handleLogout = () => {
        localStorage.removeItem('tcms_token');
        localStorage.removeItem('tcms_user');
        navigate('/login');
    };

    const navigation = [
        { name: 'Dashboard', href: '/', icon: Activity },
        { name: 'Repository', href: '/repository', icon: Layers },
        { name: 'Test Plans', href: '/plans', icon: ClipboardList },
        { name: 'Test Runs', href: '/runs', icon: Presentation },
    ];

    return (
        <div className="flex h-screen bg-white">
            {/* Global Sidebar */}
            <div className="w-16 flex-shrink-0 flex flex-col items-center py-4 bg-slate-900 border-r border-slate-800">
                <div className="w-10 h-10 bg-primary-600 text-white rounded-lg flex items-center justify-center font-bold text-xl mb-8">
                    T
                </div>

                <nav className="flex-1 space-y-4">
                    {navigation.map((item) => {
                        const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href));
                        return (
                            <Link
                                key={item.name}
                                to={item.href}
                                className={`p-2 rounded-lg flex items-center justify-center transition-colors ${isActive ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                    }`}
                                title={item.name}
                            >
                                <item.icon className="w-6 h-6" />
                            </Link>
                        );
                    })}
                </nav>

                <div className="mt-auto flex flex-col items-center gap-2">
                    {/* Settings - Admin Only */}
                    {isAdmin && (
                        <Link
                            to="/settings"
                            className={`p-2 rounded-lg flex items-center justify-center transition-colors ${location.pathname.startsWith('/settings')
                                    ? 'bg-primary-600 text-white'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                }`}
                            title="Settings (Admin)"
                        >
                            <SettingsIcon className="w-5 h-5" />
                        </Link>
                    )}

                    {/* Current User Avatar */}
                    <button
                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        title={currentUser?.username || 'Account'}
                    >
                        <User className="w-5 h-5" />
                    </button>

                    {/* Logout */}
                    <button
                        onClick={handleLogout}
                        className="p-2 mb-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                        title="Log out"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col overflow-hidden bg-white">
                <Outlet />
            </main>
        </div>
    );
}
