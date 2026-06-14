import { useCallback, useEffect, useRef, useState } from 'react';
import { Users, LogOut } from 'lucide-react';
import api from '../../lib/api';

const HEARTBEAT_INTERVAL_MS = 30_000;

interface OnlineUser {
    id: number;
    username: string;
    // Online but no real activity within the server's idle window → amber dot.
    idle?: boolean;
}

interface PresenceSnapshot {
    online: number;
    users: OnlineUser[];
}

function readCurrentUser(): { id?: number; role?: string } {
    try {
        return JSON.parse(localStorage.getItem('tcms_user') || '{}');
    } catch {
        return {};
    }
}

/**
 * 站上人數 — lives at the bottom of the global sidebar. Pings the presence
 * heartbeat on a timer; the same call both registers this user as online and
 * returns the live count, so one request does double duty. Failures are
 * swallowed (it's an ambient indicator, never worth surfacing an error or
 * bouncing the user).
 *
 * Click the indicator to flip open a flyout listing who is online. Admins get a
 * "踢" button per row (not on themselves) that boots that user — the backend
 * expires their tokens so they're bounced to /login on their next request.
 * The flyout is `position: fixed` (anchored off the button's rect) so it
 * escapes the sidebar's `overflow-hidden` clipping and the narrow column.
 */
export default function OnlineUsersIndicator({ expanded }: { expanded: boolean }) {
    const [snapshot, setSnapshot] = useState<PresenceSnapshot | null>(null);
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null);
    const [kicking, setKicking] = useState<number | null>(null);
    const btnRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);

    const me = readCurrentUser();
    const isAdmin = me.role === 'Admin';

    useEffect(() => {
        let cancelled = false;

        const beat = async () => {
            try {
                // Timer-driven poll — mark as background so it doesn't reset the
                // server-side idle clock (see deps.py ACTIVITY_HEADER).
                const { data } = await api.post<PresenceSnapshot>('/presence/heartbeat', null, {
                    headers: { 'X-TCMS-Activity': 'background' },
                });
                if (!cancelled) setSnapshot(data);
            } catch {
                // ambient widget — ignore transient failures
            }
        };

        beat();
        const id = setInterval(beat, HEARTBEAT_INTERVAL_MS);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, []);

    // Close on outside click / Escape.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const computeAnchor = useCallback(() => {
        const rect = btnRef.current?.getBoundingClientRect();
        if (rect) setAnchor({ left: rect.right + 8, bottom: window.innerHeight - rect.bottom });
    }, []);

    const toggle = () => {
        computeAnchor();
        setOpen((v) => !v);
    };

    // The sidebar collapse/expand moves the anchor button (w-44 ↔ w-14) with a
    // CSS transition; rather than chase the moving target, just close the flyout
    // so it can't drift away from the button.
    useEffect(() => { setOpen(false); }, [expanded]);

    // Keep the fixed flyout pinned to the button across window resizes.
    useEffect(() => {
        if (!open) return;
        window.addEventListener('resize', computeAnchor);
        return () => window.removeEventListener('resize', computeAnchor);
    }, [open, computeAnchor]);

    const kick = async (u: OnlineUser) => {
        if (!window.confirm(`確定要把「${u.username}」踢下線嗎？\n對方會被導回登入頁，需重新登入。`)) return;
        setKicking(u.id);
        try {
            const { data } = await api.post<PresenceSnapshot>(`/presence/kick/${u.id}`);
            setSnapshot(data);
        } catch {
            window.alert('踢人失敗（可能權限不足或對方已離線）。');
        } finally {
            setKicking(null);
        }
    };

    const count = snapshot?.online ?? 0;
    const users = snapshot?.users ?? [];

    return (
        <>
            <button
                ref={btnRef}
                onClick={toggle}
                aria-haspopup="true"
                aria-expanded={open}
                className={`flex items-center gap-3 px-2 py-2 rounded-lg w-full transition-colors ${
                    open
                        ? 'bg-sidebar-active text-sidebar-text-active'
                        : 'text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover'
                }`}
                title="站上人數（點擊看名單）"
            >
                <span className="relative shrink-0">
                    <Users className="w-5 h-5" />
                    <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 flex items-center justify-center rounded-full bg-primary-500 text-sidebar-bg text-[10px] font-semibold leading-none">
                        {count}
                    </span>
                </span>
                {expanded && (
                    <span className="text-sm truncate">
                        站上人數 <span className="font-semibold text-sidebar-text-active">{count}</span>
                    </span>
                )}
            </button>

            {open && anchor && (
                <div
                    ref={popRef}
                    style={{ position: 'fixed', left: anchor.left, bottom: anchor.bottom, zIndex: 50 }}
                    className="w-60 max-h-72 overflow-y-auto rounded-lg bg-white shadow-xl border border-gray-200 py-1.5"
                >
                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-b border-gray-100">
                        站上人數 {count}
                    </div>
                    {users.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-400">目前沒有人在線上</div>
                    ) : (
                        <ul>
                            {users.map((u) => {
                                const isSelf = u.id === me.id;
                                return (
                                    <li
                                        key={u.id}
                                        className="group flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                        <span
                                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${u.idle ? 'bg-amber-500' : 'bg-green-500'}`}
                                            title={u.idle ? '閒置中' : '上線中'}
                                        />
                                        <span className="truncate flex-1">
                                            {u.username}
                                            {isSelf && <span className="text-gray-400">（我）</span>}
                                            {u.idle && <span className="ml-1 text-amber-500 text-xs">閒置</span>}
                                        </span>
                                        {isAdmin && !isSelf && (
                                            <button
                                                onClick={() => kick(u)}
                                                disabled={kicking === u.id}
                                                className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-red-500 hover:bg-red-50 disabled:opacity-50"
                                                title={`踢「${u.username}」下線`}
                                            >
                                                <LogOut className="w-3.5 h-3.5" />
                                                {kicking === u.id ? '…' : '踢'}
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </>
    );
}
