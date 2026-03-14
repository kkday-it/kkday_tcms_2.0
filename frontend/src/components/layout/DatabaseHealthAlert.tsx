import { useState, useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import api from '../../lib/api';

export default function DatabaseHealthAlert() {
    const [health, setHealth] = useState<{
        healthy: boolean;
        missing_tables: string[];
        missing_columns: Record<string, string[]>;
    } | null>(null);

    const checkHealth = async () => {
        try {
            const response = await api.get('/system/status');
            setHealth(response.data.database);
        } catch (error) {
            console.error('Failed to check DB health:', error);
        }
    };

    useEffect(() => {
        checkHealth();
        // Poll every 30 seconds
        const interval = setInterval(checkHealth, 30000);
        return () => clearInterval(interval);
    }, []);

    if (!health || health.healthy) return null;

    return (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
            <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
                    <AlertCircle className="w-4 h-4" />
                    <span>資料庫結構似乎已過時（偵測到缺失欄位或表格）。</span>
                    <span className="hidden md:inline text-amber-600 font-normal">
                        若您是在開發環境，請執行同步腳本來更新本地 DB。
                    </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                    <code className="bg-amber-100 px-2 py-0.5 rounded border border-amber-200 text-amber-700">
                        python3 scripts/sync_remote_to_local.py
                    </code>
                    <button
                        onClick={checkHealth}
                        className="flex items-center gap-1 text-amber-700 hover:text-amber-900 font-semibold"
                    >
                        <RefreshCw className="w-3 h-3" />
                        重試
                    </button>
                </div>
            </div>
        </div>
    );
}
