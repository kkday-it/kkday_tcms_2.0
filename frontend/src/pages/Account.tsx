/**
 * 帳號 — personal account page.
 *
 * Sibling of Settings.tsx for things that belong to the logged-in user
 * (their tokens, their profile in the future, their sessions) rather than
 * to the workspace. API Tokens used to live under Settings → API Tokens
 * but that's a per-user resource, not a workspace setting — moved here.
 *
 * Layout mirrors Settings on purpose so the two pages feel familiar:
 *   - Header at the top
 *   - Left-side tab nav (we keep the tab list even with one entry so a
 *     future Profile / Sessions tab plugs in without rewriting the page)
 *   - Right-side content panel
 */

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import ApiTokensPanel from '../components/account/ApiTokensPanel';

type AccountTab = 'api-tokens';

const TABS: { id: AccountTab; label: string; icon: React.ElementType }[] = [
    { id: 'api-tokens', label: 'API Tokens', icon: KeyRound },
];

export default function Account() {
    const currentUserJson = localStorage.getItem('tcms_user');
    const currentUser = currentUserJson ? JSON.parse(currentUserJson) : null;
    const [activeTab, setActiveTab] = useState<AccountTab>('api-tokens');

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
            <header className="bg-white border-b border-slate-200 px-8 py-5 shrink-0">
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">帳號</h1>
                <p className="text-sm text-slate-500 mt-1">
                    {currentUser?.full_name || currentUser?.username || '你的帳號'}
                    {currentUser?.role && <span className="ml-2 text-xs font-semibold uppercase text-slate-400">· {currentUser.role}</span>}
                </p>
            </header>

            <div className="flex-1 flex overflow-hidden">
                <nav className="w-56 shrink-0 bg-white border-r border-slate-200 p-4 flex flex-col gap-1">
                    {TABS.map(tab => (
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
                        </button>
                    ))}
                </nav>

                <div className="flex-1 overflow-y-auto p-8">
                    {activeTab === 'api-tokens' && <ApiTokensPanel />}
                </div>
            </div>
        </div>
    );
}
