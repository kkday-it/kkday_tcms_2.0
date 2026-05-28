/**
 * URL query string helpers for filter / sort state.
 *
 * Spec: filter-spec-v3 §9.
 *
 * These wrap react-router's `useSearchParams` so a filter field reads its
 * value from `?<key>=…` and writes back through the same hook. Two reasons
 * to live in the URL rather than just useState:
 *   1. The page survives reload / hard refresh with filters intact
 *   2. Shared links carry the filter (you can paste a /repository?priority=…
 *      URL into Slack and the receiver sees the same view)
 *
 * Convention (matches spec §9):
 *   - missing param == "no filter" (the field is dropped from the URL when
 *     cleared, never written as empty string — keeps shared URLs short)
 *   - set / array values join with commas: `?result=failed,blocked`
 *   - sort uses a single composite key: `?sort=priority:desc`
 *
 * Calls use `replace: true` so flipping a pill doesn't pile up history
 * entries — back-button is for navigation, not undoing a pill click.
 */

import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SortDirection } from '../components/common/SortableHeader';

// ── single string ─────────────────────────────────────────────────────────

export function useUrlString(key: string): [string, (v: string) => void] {
    const [params, setParams] = useSearchParams();
    const value = params.get(key) ?? '';
    const set = useCallback((v: string) => {
        setParams(prev => {
            const next = new URLSearchParams(prev);
            if (v) next.set(key, v);
            else next.delete(key);
            return next;
        }, { replace: true });
    }, [key, setParams]);
    return [value, set];
}

// ── comma-separated set of strings ────────────────────────────────────────

export function useUrlStringList(key: string): [string[], (v: string[]) => void] {
    const [params, setParams] = useSearchParams();
    const raw = params.get(key);
    // raw === '' (i.e. ?priority=) returns [''] from split — drop that case
    // and treat blank-but-present same as missing.
    const value: string[] = raw ? raw.split(',').filter(Boolean) : [];
    const set = useCallback((v: string[]) => {
        setParams(prev => {
            const next = new URLSearchParams(prev);
            if (v.length > 0) next.set(key, v.join(','));
            else next.delete(key);
            return next;
        }, { replace: true });
    }, [key, setParams]);
    return [value, set];
}

// ── sort: "<key>:<asc|desc>" composite ────────────────────────────────────

export interface SortState {
    key: string | null;
    direction: SortDirection;
}

export function useUrlSortState(paramKey = 'sort'): [SortState, (next: SortState) => void] {
    const [params, setParams] = useSearchParams();
    const raw = params.get(paramKey);
    let state: SortState = { key: null, direction: null };
    if (raw) {
        const [k, d] = raw.split(':');
        if (k && (d === 'asc' || d === 'desc')) {
            state = { key: k, direction: d };
        }
    }
    const set = useCallback((next: SortState) => {
        setParams(prev => {
            const ps = new URLSearchParams(prev);
            if (next.key && next.direction) ps.set(paramKey, `${next.key}:${next.direction}`);
            else ps.delete(paramKey);
            return ps;
        }, { replace: true });
    }, [paramKey, setParams]);
    return [state, set];
}
