// PR-3 (auth rollout): runtime role check used to hide write/destructive
// buttons for non-Admin/QA users. The backend still enforces — this is purely
// UX so users without permission don't see actions that would 403 anyway.
//
// Source of truth is `localStorage.tcms_user` (set by Login.tsx). We read on
// every call rather than caching so a role change picked up via a fresh login
// is reflected immediately without a page reload.

export type Role = 'Admin' | 'QA' | 'RD' | 'Tester' | 'PM' | string;

function readRole(): Role | null {
    try {
        const raw = localStorage.getItem('tcms_user');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.role ?? null;
    } catch {
        return null;
    }
}

/** Admin or QA — the roles allowed to write/delete most resources (test cases, runs, plans, ...). */
export function canWrite(): boolean {
    const r = readRole();
    return r === 'Admin' || r === 'QA';
}

/** Admin only — user management and other admin-restricted writes. */
export function isAdmin(): boolean {
    return readRole() === 'Admin';
}

/** Returns the raw role string (or null if not logged in). For display / debug only. */
export function currentRole(): Role | null {
    return readRole();
}
