import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:19425/api/v1',
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 30_000,
});

export default api;
