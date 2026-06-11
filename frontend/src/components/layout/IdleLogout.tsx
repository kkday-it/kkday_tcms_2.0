import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * 閒置自動登出 — UX 層。
 *
 * 監聽鍵盤/滑鼠/捲動等「真實互動」，閒置超過 IDLE_MINUTES 即清除 token 並導回
 * /login;逾時前 WARN_SECONDS 秒先跳提示讓使用者可以續用。
 *
 * 注意:這層只是體驗優化(只在這個分頁生效、且可被改 JS 繞過)。真正的把關在後端
 * deps.py 的 idle 閘門:web-session token 閒置過久會直接 401,API token 不受影響。
 * 兩者用同一個 60 分鐘門檻(後端可用 TCMS_WEB_SESSION_IDLE_MINUTES 覆寫,前端用
 * VITE_IDLE_TIMEOUT_MINUTES;兩邊要對齊)。
 */
const IDLE_MINUTES = Number(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES) || 60;
const IDLE_MS = IDLE_MINUTES * 60_000;
const WARN_SECONDS = 60;
const WARN_MS = WARN_SECONDS * 1000;

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
    'mousedown',
    'mousemove',
    'keydown',
    'scroll',
    'touchstart',
    'click',
];

export default function IdleLogout() {
    const navigate = useNavigate();
    const lastActivityRef = useRef<number>(Date.now());
    const [warnRemaining, setWarnRemaining] = useState<number | null>(null);

    useEffect(() => {
        // Activity → reset the clock. Throttled to once/sec so mousemove storms
        // don't thrash. Any interaction while the warning is up dismisses it.
        const markActivity = () => {
            const now = Date.now();
            if (now - lastActivityRef.current < 1000) return;
            lastActivityRef.current = now;
            setWarnRemaining((cur) => (cur !== null ? null : cur));
        };

        ACTIVITY_EVENTS.forEach((evt) =>
            window.addEventListener(evt, markActivity, { passive: true }),
        );

        const logout = () => {
            localStorage.removeItem('tcms_token');
            localStorage.removeItem('tcms_user');
            navigate('/login', { replace: true });
        };

        // Single 1s ticker drives both the warning and the final logout, so there's
        // no per-event timer churn.
        const tick = setInterval(() => {
            const idleFor = Date.now() - lastActivityRef.current;
            if (idleFor >= IDLE_MS) {
                logout();
            } else if (idleFor >= IDLE_MS - WARN_MS) {
                setWarnRemaining(Math.ceil((IDLE_MS - idleFor) / 1000));
            }
        }, 1000);

        return () => {
            ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActivity));
            clearInterval(tick);
        };
    }, [navigate]);

    if (warnRemaining === null) return null;

    const stay = () => {
        lastActivityRef.current = Date.now();
        setWarnRemaining(null);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
                <h2 className="text-lg font-semibold text-gray-900">即將自動登出</h2>
                <p className="mt-2 text-sm text-gray-600">
                    偵測到您已閒置一段時間，將在{' '}
                    <span className="font-semibold text-danger-500">{warnRemaining}</span> 秒後自動登出。
                </p>
                <div className="mt-5 flex justify-end gap-2">
                    <button
                        onClick={stay}
                        className="px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-colors"
                    >
                        繼續使用
                    </button>
                </div>
            </div>
        </div>
    );
}
