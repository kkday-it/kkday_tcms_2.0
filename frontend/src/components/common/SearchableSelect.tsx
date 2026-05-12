import Select, { components, OptionProps, SingleValue, StylesConfig } from 'react-select';
import { useMemo } from 'react';

// KQT-15196: shared searchable dropdown so folder/suite/user selects can be
// typed-into (Chinese supported via react-select's default substring filter).
//
// Keeps the native-<select> ergonomics callers expected: value is the raw
// scalar (string|number|''), onChange receives the same. No multi-select here;
// use react-select directly if you need that.

export interface SearchableOption {
    value: string | number;
    label: string;
    /** Optional secondary text rendered in muted style (e.g. folder path). */
    hint?: string;
    /** Optional original/source object for callers that need it back. */
    raw?: unknown;
}

interface SearchableSelectProps {
    value: string | number | '';
    onChange: (value: string | number | '') => void;
    options: SearchableOption[];
    placeholder?: string;
    allowClear?: boolean;
    disabled?: boolean;
    className?: string;
    /** When true, render in compact (h-8, smaller padding) form. */
    compact?: boolean;
    ariaLabel?: string;
}

const buildStyles = (compact: boolean): StylesConfig<SearchableOption, false> => ({
    control: (base, state) => ({
        ...base,
        minHeight: compact ? '32px' : '38px',
        fontSize: '0.875rem',
        borderRadius: '0.375rem',
        borderColor: state.isFocused ? '#0ea5e9' : '#cbd5e1',
        boxShadow: state.isFocused ? '0 0 0 1px #0ea5e9' : 'none',
        '&:hover': { borderColor: state.isFocused ? '#0ea5e9' : '#94a3b8' },
    }),
    valueContainer: (base) => ({
        ...base,
        padding: compact ? '0 6px' : '2px 8px',
    }),
    indicatorsContainer: (base) => ({
        ...base,
        height: compact ? '32px' : '38px',
    }),
    option: (base, state) => ({
        ...base,
        fontSize: '0.875rem',
        color: '#334155',
        backgroundColor: state.isSelected
            ? '#e0f2fe'
            : state.isFocused
                ? '#f1f5f9'
                : 'white',
        cursor: 'pointer',
        padding: '8px 12px',
    }),
    menu: (base) => ({
        ...base,
        zIndex: 9999,
        borderRadius: '0.375rem',
        boxShadow: '0 4px 12px -2px rgb(0 0 0 / 0.12)',
        border: '1px solid #e2e8f0',
    }),
    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
    placeholder: (base) => ({ ...base, color: '#94a3b8' }),
    singleValue: (base) => ({ ...base, color: '#0f172a' }),
});

const HintedOption = (props: OptionProps<SearchableOption, false>) => {
    const { data } = props;
    return (
        <components.Option {...props}>
            <div className="flex flex-col">
                <span>{data.label}</span>
                {data.hint && (
                    <span className="text-xs text-slate-400 mt-0.5 truncate">{data.hint}</span>
                )}
            </div>
        </components.Option>
    );
};

export default function SearchableSelect({
    value,
    onChange,
    options,
    placeholder = 'Select...',
    allowClear = true,
    disabled = false,
    className,
    compact = false,
    ariaLabel,
}: SearchableSelectProps) {
    const styles = useMemo(() => buildStyles(compact), [compact]);

    // react-select needs the option object (not the raw scalar) as its `value`.
    const selected = useMemo<SingleValue<SearchableOption>>(() => {
        if (value === '' || value === null || value === undefined) return null;
        return options.find(o => o.value === value) ?? null;
    }, [value, options]);

    const handleChange = (opt: SingleValue<SearchableOption>) => {
        onChange(opt ? opt.value : '');
    };

    // Substring filter — works for CJK because String.includes treats input as
    // code-point sequence (no need for tokenizer). Also matches the hint so users
    // can search by folder path.
    const filterOption = (option: { data: SearchableOption }, rawInput: string) => {
        if (!rawInput) return true;
        const needle = rawInput.toLowerCase();
        const label = option.data.label?.toLowerCase() ?? '';
        const hint = option.data.hint?.toLowerCase() ?? '';
        return label.includes(needle) || hint.includes(needle);
    };

    return (
        <div className={className}>
            <Select<SearchableOption, false>
                options={options}
                value={selected}
                onChange={handleChange}
                placeholder={placeholder}
                isClearable={allowClear}
                isDisabled={disabled}
                isSearchable
                noOptionsMessage={() => 'No matches'}
                components={{ Option: HintedOption }}
                styles={styles}
                aria-label={ariaLabel}
                menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                menuPosition="fixed"
                filterOption={filterOption}
            />
        </div>
    );
}
