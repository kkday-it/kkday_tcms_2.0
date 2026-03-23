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

export default api;
