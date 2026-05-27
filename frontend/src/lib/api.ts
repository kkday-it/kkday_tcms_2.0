import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:19425/api/v1',
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 30_000,
});

api.interceptors.request.use((config) => {
    try {
        // Bearer token (PR-2): backend get_current_user authenticates by this. Falls back
        // to the legacy mock token during the grace period; either way the X-User-Id below
        // keeps the dual-mode path working until everyone has a real token.
        const token = localStorage.getItem('tcms_token');
        if (token) config.headers['Authorization'] = `Bearer ${token}`;

        const userJson = localStorage.getItem('tcms_user');
        if (userJson) {
            const user = JSON.parse(userJson);
            if (user?.id) config.headers['X-User-Id'] = String(user.id);
        }
    } catch {
        // ignore
    }
    return config;
});

api.interceptors.response.use(
    (response) => {
        // Grace-period auto-upgrade: backend mints a real token for legacy mock-token
        // clients and returns it here. Persist it so subsequent requests use the real one.
        const auto = response.headers['x-auto-issued-token'];
        if (auto) localStorage.setItem('tcms_token', auto);
        return response;
    },
    (error) => {
        const status = error?.response?.status;
        const url: string = error?.config?.url || '';
        // Don't bounce on the login request itself (Login.tsx shows its own error), and
        // don't loop if we're already on the login page.
        const isAuthCall = url.includes('/users/login');
        if (status === 401 && !isAuthCall && !window.location.pathname.endsWith('/login')) {
            localStorage.removeItem('tcms_token');
            localStorage.removeItem('tcms_user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    },
);

export default api;
