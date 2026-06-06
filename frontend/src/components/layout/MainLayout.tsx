import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Presentation, Layers, Activity, Settings as SettingsIcon, User, ClipboardList, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import DatabaseHealthAlert from './DatabaseHealthAlert';
import LocalDbBadge from './LocalDbBadge';
import OnlineUsersIndicator from './OnlineUsersIndicator';

export default function MainLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);

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
        { name: '儀表板', href: '/', icon: Activity },
        { name: '案例庫', href: '/repository', icon: Layers },
        { name: '測試計畫', href: '/plans', icon: ClipboardList },
        { name: '測試執行', href: '/runs', icon: Presentation },
    ];

    return (
        <div className="flex h-screen bg-white">
            {/* Global Sidebar — spec filter-spec-v3 §3: navy bg + cyan accent.
                Active state is a cyan-tinted bg (10% opacity) over navy with
                cyan text, not a full primary fill — keeps the brand color as
                an *accent* rather than dominating the chrome. */}
            <div
                className={`${isSidebarExpanded ? 'w-44' : 'w-14'} flex-shrink-0 flex flex-col py-4 bg-sidebar-bg border-r border-sidebar-divider transition-all duration-200 overflow-hidden`}
            >
                {/* Logo + Collapse Toggle. T sits on a cyan tile with the bg
                    color as the letter — high contrast, no need for white. */}
                <div className="flex items-center justify-between px-3 mb-8">
                    <div className="w-10 h-10 bg-primary-500 text-sidebar-bg rounded-lg flex items-center justify-center font-bold text-xl shrink-0">
                        T
                    </div>
                    {isSidebarExpanded && (
                        <button
                            onClick={() => setIsSidebarExpanded(false)}
                            className="p-1.5 text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover rounded-md transition-colors"
                            title="收合選單"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Expand button when collapsed */}
                {!isSidebarExpanded && (
                    <div className="flex justify-center mb-4">
                        <button
                            onClick={() => setIsSidebarExpanded(true)}
                            className="p-1.5 text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover rounded-md transition-colors"
                            title="展開選單"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                )}

                <nav className="flex-1 space-y-1 px-2">
                    {navigation.map((item) => {
                        const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href));
                        return (
                            <Link
                                key={item.name}
                                to={item.href}
                                aria-current={isActive ? 'page' : undefined}
                                className={`flex items-center gap-3 px-2 py-2 rounded-lg transition-colors ${isActive ? 'bg-sidebar-active text-sidebar-text-active font-medium' : 'text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover'}`}
                                title={item.name}
                            >
                                <item.icon className="w-5 h-5 shrink-0" />
                                {isSidebarExpanded && (
                                    <span className="text-sm truncate">{item.name}</span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div className="mt-auto space-y-1 px-2">
                    {/* 站上人數 — ambient usage indicator, sits above the
                        account/settings cluster at the bottom-left. */}
                    <OnlineUsersIndicator expanded={isSidebarExpanded} />
                    <div className="border-t border-sidebar-divider my-1" />

                    {/* Settings - Admin Only */}
                    {isAdmin && (
                        <Link
                            to="/settings"
                            aria-current={location.pathname.startsWith('/settings') ? 'page' : undefined}
                            className={`flex items-center gap-3 px-2 py-2 rounded-lg transition-colors ${location.pathname.startsWith('/settings')
                                ? 'bg-sidebar-active text-sidebar-text-active font-medium'
                                : 'text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover'
                                }`}
                            title="設定（管理員）"
                        >
                            <SettingsIcon className="w-5 h-5 shrink-0" />
                            {isSidebarExpanded && <span className="text-sm">設定</span>}
                        </Link>
                    )}

                    {/* Account — hosts API Tokens (moved out of Settings) and
                        is where per-user stuff (profile, sessions, …) will live. */}
                    <Link
                        to="/account"
                        className={`flex items-center gap-3 px-2 py-2 rounded-lg w-full transition-colors ${location.pathname.startsWith('/account')
                            ? 'bg-sidebar-active text-sidebar-text-active font-medium'
                            : 'text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover'
                            }`}
                        title={currentUser?.username || '帳號'}
                    >
                        <User className="w-5 h-5 shrink-0" />
                        {isSidebarExpanded && (
                            <span className="text-sm truncate">{currentUser?.username || '帳號'}</span>
                        )}
                    </Link>

                    {/* Logout — destructive intent stays in the hover (red).
                        text-danger-400 reads as a warning over the navy bg. */}
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-2 py-2 mb-2 rounded-lg w-full text-sidebar-text hover:text-danger-400 hover:bg-sidebar-hover transition-colors"
                        title="登出"
                    >
                        <LogOut className="w-5 h-5 shrink-0" />
                        {isSidebarExpanded && <span className="text-sm">登出</span>}
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col overflow-hidden bg-white">
                <LocalDbBadge />
                <DatabaseHealthAlert />
                <Outlet />
            </main>
        </div>
    );
}
