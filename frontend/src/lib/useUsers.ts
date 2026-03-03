import { useState, useEffect, useCallback } from 'react';
import api from './api';

export interface AppUser {
    id: number;
    username: string;
    full_name?: string;
    email?: string;
    role?: string;
}

let cached: AppUser[] | null = null;

/**
 * Hook that fetches /users/ with in-memory cache to avoid duplicate requests.
 * Use refresh() after creating/updating users (e.g. Users page, Settings).
 */
export function useUsers() {
    const [users, setUsers] = useState<AppUser[]>(cached ?? []);
    const [isLoading, setIsLoading] = useState(!cached);

    const fetchUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await api.get<AppUser[]>('/users/');
            cached = res.data;
            setUsers(cached);
        } catch (err) {
            console.error('Failed to fetch users', err);
            setUsers([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (cached) {
            setUsers(cached);
            setIsLoading(false);
            return;
        }
        fetchUsers();
    }, [fetchUsers]);

    const refresh = useCallback(() => {
        cached = null;
        fetchUsers();
    }, [fetchUsers]);

    return { users, isLoading, refresh };
}
