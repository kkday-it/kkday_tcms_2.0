/**
 * PillGroup — labelled multi-select pill row used by filter regions.
 *
 * Spec: filter-spec-v3 §4.3 / §8.
 *
 * Two visual variants:
 *   - `round`: filter-spec-v3 §4.3 Result pill — rounded-full + dot prefix
 *   - `square`: filter-spec-v3 §4.3 Priority pill — rounded-md, no dot
 *
 * Selected state: bg-{variant}-50 + text-{variant}-800 + ring-{variant}-800
 * (the ring is what calls out "selected" — no extra checkmark/icon needed).
 *
 * Unselected state: bg-slate-100 + text-slate-500 (`neutral` role is fulfilled
 * by slate per audit; we don't introduce a parallel `neutral` ramp).
 *
 * `notset` variant uses a dashed border in default state — flags it as an
 * exception that shouldn't be there once Priority becomes mandatory
 * (filter-spec-v3 §4.3 footnote).
 *
 * Toggle semantics (spec §4.4):
 *   - clicking an unselected pill adds its value to the set
 *   - clicking a selected pill removes it (no extra deselect affordance)
 *   - within a group: OR; across groups: AND (composed by the caller)
 *
 * Accessibility (spec §11):
 *   - aria-pressed reflects selection so screen readers announce toggle
 *     state without inferring from the ring styling
 *   - native <button> already handles Space/Enter and the button role; no
 *     extra key handler or explicit role needed
 */

export type PillType = 'round' | 'square';
export type PillVariant = 'success' | 'danger' | 'info' | 'warning' | 'neutral';
export type PillStyle = 'default' | 'dashed';

export interface PillOption {
    value: string;
    label: string;
    variant: PillVariant;
    style?: PillStyle;
    /** True = no result rows would match this value in the current dataset.
     *  Dimmed to 40% — discoverable but signals "would filter to zero". */
    dimmed?: boolean;
}

export interface PillGroupProps {
    /** Group heading, rendered in `text-[11px] uppercase tracking-wider`. */
    label: string;
    type: PillType;
    options: ReadonlyArray<PillOption>;
    value: ReadonlySet<string>;
    onChange: (next: Set<string>) => void;
}

// Tailwind class lookups kept here so callers pass `variant` (semantic name)
// rather than a long class blob — keeps the call sites declarative and means
// the colour ramp can be swapped centrally if the design ever changes.
const SELECTED_BG: Record<PillVariant, string> = {
    success: 'bg-success-50 text-success-800 ring-success-800',
    danger:  'bg-danger-50 text-danger-800 ring-danger-800',
    info:    'bg-info-50 text-info-800 ring-info-800',
    warning: 'bg-warning-50 text-warning-800 ring-warning-800',
    neutral: 'bg-slate-100 text-slate-800 ring-slate-800',
};

const DOT_BG: Record<PillVariant, string> = {
    success: 'bg-success-600',
    danger:  'bg-danger-400',
    info:    'bg-slate-400',     // info → "untested" reads better with a muted dot
    warning: 'bg-warning-400',
    neutral: 'bg-slate-200',
};

export default function PillGroup({ label, type, options, value, onChange }: PillGroupProps) {
    const togglePill = (v: string) => {
        const next = new Set(value);
        if (next.has(v)) next.delete(v);
        else next.add(v);
        onChange(next);
    };

    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-medium tracking-wider uppercase text-slate-400 mr-0.5">{label}</span>
            {options.map(opt => {
                const selected = value.has(opt.value);
                const isDashed = opt.style === 'dashed';

                const base = type === 'round'
                    ? 'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs rounded-full transition'
                    : 'inline-flex items-center px-2.5 py-0.5 text-xs rounded-md transition';

                const stateClass = selected
                    ? `${SELECTED_BG[opt.variant]} ring-[1.5px] ring-inset`
                    : isDashed
                        ? 'bg-transparent text-slate-400 border border-dashed border-black/[0.15] hover:border-slate-400'
                        : `bg-slate-100 text-slate-500 hover:bg-slate-200${opt.dimmed ? ' opacity-40' : ''}`;

                return (
                    <button
                        key={opt.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => togglePill(opt.value)}
                        title={opt.dimmed ? '此資料集內無此值' : undefined}
                        className={`${base} ${stateClass}`}
                    >
                        {type === 'round' && (
                            <span className={`w-1.5 h-1.5 rounded-full ${selected ? DOT_BG[opt.variant] : 'bg-current'}`} />
                        )}
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
