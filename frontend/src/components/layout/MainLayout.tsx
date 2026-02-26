import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Presentation, Layers, Activity, Settings, User, Users, ClipboardList, LogOut } from 'lucide-react';

export default function MainLayout() {
    const location = useLocation();
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('tcms_token');
        localStorage.removeItem('tcms_user');
        navigate('/login');
    };

    const navigation = [
        { name: 'Dashboard', href: '/', icon: Activity },
        { name: 'Repository', href: '/project/1', icon: Layers },
        { name: 'Test Plans', href: '/plans', icon: ClipboardList },
        { name: 'Test Runs', href: '/runs', icon: Presentation },
        { name: 'Users', href: '/users', icon: Users },
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
                        const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
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

                <div className="mt-auto space-y-4 flex flex-col items-center">
                    <button className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                        <User className="w-5 h-5" />
                    </button>
                    <button onClick={handleLogout} className="p-2 mb-4 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors" title="Log out">
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
