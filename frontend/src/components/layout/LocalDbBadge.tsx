import { useState, useEffect } from 'react';
import { Database } from 'lucide-react';
import api from '../../lib/api';

interface DbMode {
    mode: 'local' | 'remote';
    dialect: string;
    url_redacted: string;
}

/**
 * 頂端提示條：當 backend 跑在 USE_LOCAL_DB=true (本機 SQLite / 自帶 host)
 * 時顯示一條淺色 strip。Prod 模式 (mode==='remote') 不渲染，避免噪音。
 *
 * 抓資料來源：`GET /api/v1/system/status`（與 DatabaseHealthAlert 同 endpoint）。
 * 每 5 分鐘輪詢一次，schema 與 mode 變化頻率都低，不需要更頻繁。
 */
export default function LocalDbBadge() {
    const [dbMode, setDbMode] = useState<DbMode | null>(null);

    useEffect(() => {
        let alive = true;
        const fetchMode = () => {
            // Background poll — don't reset the server-side idle clock (deps.py).
            api.get('/system/status', { headers: { 'X-TCMS-Activity': 'background' } })
                .then(res => { if (alive) setDbMode(res.data.db_mode ?? null); })
                .catch(err => console.error('Failed to fetch db_mode:', err));
        };
        fetchMode();
        const interval = setInterval(fetchMode, 300_000);
        return () => { alive = false; clearInterval(interval); };
    }, []);

    if (!dbMode || dbMode.mode !== 'local') return null;

    return (
        <div
            className="bg-amber-50 border-b border-amber-200 px-4 py-2"
            title={dbMode.url_redacted}
        >
            <div className="max-w-7xl mx-auto flex items-center gap-2 text-sm">
                <Database className="w-4 h-4 text-amber-700 shrink-0" />
                <span className="font-medium text-amber-900">本機 DB</span>
                <span className="text-amber-700">({dbMode.dialect})</span>
                <code className="text-xs text-amber-700/80 font-mono truncate">
                    {dbMode.url_redacted}
                </code>
            </div>
        </div>
    );
}
