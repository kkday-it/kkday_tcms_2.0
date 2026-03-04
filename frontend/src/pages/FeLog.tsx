import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'lucide-react';
import api from '../lib/api';

export default function FeLog() {
  const preRef = useRef<HTMLPreElement>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  useEffect(() => {
    const baseURL = api.defaults.baseURL || '';
    const url = baseURL.replace(/\/api\/v1\/?$/, '') + '/api/v1/logs/stream?source=fe';
    const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;

    const evtSource = new EventSource(fullUrl);

    evtSource.onopen = () => setStatus('connected');
    evtSource.onerror = () => setStatus('error');
    evtSource.onmessage = (e) => {
      if (e.data.startsWith(': ')) return; // keepalive
      setLogs((prev) => [...prev.slice(-999), e.data]);
    };

    return () => evtSource.close();
  }, []);

  useEffect(() => {
    preRef.current?.scrollTo(0, preRef.current.scrollHeight);
  }, [logs]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-900 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-700 bg-slate-800">
        <Terminal className="w-5 h-5 text-green-400" />
        <h1 className="text-lg font-semibold text-slate-100">Frontend (Nginx) Log</h1>
        <span className={`text-xs px-2 py-0.5 rounded ${status === 'connected' ? 'bg-green-900/50 text-green-400' : status === 'error' ? 'bg-red-900/50 text-red-400' : 'bg-slate-700 text-slate-400'}`}>
          {status}
        </span>
      </div>
      <pre ref={preRef} className="flex-1 p-4 overflow-auto text-sm text-green-300 font-mono whitespace-pre-wrap">
        {logs.length === 0 && status === 'connecting' && 'Connecting...'}
        {logs.length === 0 && status === 'error' && 'Connection failed. Check if backend is running.'}
        {logs.join('')}
      </pre>
    </div>
  );
}
