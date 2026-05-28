/**
 * SortableHeader — clickable <th> with the cycling double-chevron indicator.
 *
 * Spec: filter-spec-v3 §5.
 *
 * Cycle: unsorted → asc → desc → back to default (none).
 *   - default sort key & direction are the caller's responsibility (the
 *     header itself has no opinion on what "default" means for the table —
 *     it just emits null when the user clicks past desc)
 *   - clicking a different column resets the previous one to none
 *     (parent handles this by replacing `sort` state, not via this header)
 *
 * Visual:
 *   - both chevrons always rendered; the inactive one is `black/[0.15]`
 *   - active chevron flips to `slate-900` so direction reads at a glance
 *   - header label uses spec §5.2 small-uppercase styling
 *
 * Accessibility (spec §11):
 *   - aria-sort reflects current state ("ascending" / "descending" / "none")
 *     so screen readers announce the column's role without inferring from
 *     the chevron styling
 *   - the trigger is a real <button> inside the <th>, so Space/Enter works
 *     out of the box without an extra key handler
 */

import { ChevronUp, ChevronDown } from 'lucide-react';

export type SortDirection = 'asc' | 'desc' | null;

export interface SortableHeaderProps {
    /** Label shown in the header — kept short, rendered uppercase via class. */
    label: string;
    /** This column's identifier; compared against `currentKey` to detect active. */
    sortKey: string;
    /** The currently-sorted column key (anywhere in the table), or null. */
    currentKey: string | null;
    /** Direction of the current sort; ignored if `currentKey !== sortKey`. */
    currentDirection: SortDirection;
    /** Called with `(sortKey, nextDirection)`. nextDirection cycles
     *  asc → desc → null (passed back so the caller can fall back to its
     *  own default sort, e.g. Case ID ascending). */
    onSort: (sortKey: string, direction: SortDirection) => void;
    /** Optional extra className for the <th> (alignment etc.). */
    className?: string;
}

export default function SortableHeader({
    label,
    sortKey,
    currentKey,
    currentDirection,
    onSort,
    className = '',
}: SortableHeaderProps) {
    const active = currentKey === sortKey;
    const direction = active ? currentDirection : null;

    const next = (): SortDirection => {
        if (!active || direction === null) return 'asc';
        if (direction === 'asc') return 'desc';
        return null;  // desc → cleared, parent decides what default means
    };

    return (
        <th
            className={`py-3 font-semibold border-b border-slate-200 ${className}`}
            aria-sort={
                active
                    ? direction === 'asc' ? 'ascending'
                    : direction === 'desc' ? 'descending'
                    : 'none'
                    : 'none'
            }
        >
            <button
                type="button"
                onClick={() => onSort(sortKey, next())}
                className="inline-flex items-center gap-1 text-[11px] font-medium tracking-wider uppercase text-slate-500 hover:text-slate-900 transition-colors"
            >
                {label}
                <span className="inline-flex flex-col leading-[0.5]">
                    <ChevronUp
                        className={`w-3 h-3 ${active && direction === 'asc' ? 'text-slate-900' : 'text-black/[0.15]'}`}
                    />
                    <ChevronDown
                        className={`w-3 h-3 -mt-0.5 ${active && direction === 'desc' ? 'text-slate-900' : 'text-black/[0.15]'}`}
                    />
                </span>
            </button>
        </th>
    );
}
