import Select, {
    components,
    OptionProps,
    MultiValueGenericProps,
    StylesConfig,
    FilterOptionOption,
} from 'react-select';
import { useMemo } from 'react';
import { AppUser } from '../../lib/useUsers';

// KQT-15412: searchable user picker so test-run assignees / case owners can be
// typed-into. The user directory mixes Chinese full_name with English username,
// so we search across full_name + username + email (any of the three matches)
// and display a consistent "Name · email" two-line option regardless of which
// fields are populated. react-select's substring filter handles CJK natively.
//
// Two exports: <UserSelect> (single, supports pinned sentinel options like
// "Unassigned") and <UserMultiSelect> (multi, chip style). SearchableSelect
// stays for folder/suite pickers; this owns anything user-shaped.

interface UserOption {
    value: number;
    label: string;       // primary display: full_name || username
    secondary: string;   // muted line: email (or username when name is shown)
    search: string;      // pre-lowercased "full_name username email" for filtering
    user: AppUser;
}

/** Pinned non-user option, e.g. { value: 'unassigned', label: 'Unassigned' }. */
export interface SentinelOption {
    value: string;
    label: string;
}

type AnyOption = UserOption | (SentinelOption & { secondary?: undefined; search?: undefined; user?: undefined });

const toOption = (u: AppUser): UserOption => ({
    value: u.id,
    label: u.full_name || u.username,
    // Prefer email as the muted line; if absent but we showed full_name as the
    // label, fall back to username so the English id is still visible.
    secondary: u.email || (u.full_name ? u.username : ''),
    // Built once here (not per keystroke) so filterOption is a plain substring
    // test across name + username + email.
    search: `${u.full_name ?? ''} ${u.username} ${u.email ?? ''}`.toLowerCase(),
    user: u,
});

const filterOption = (option: FilterOptionOption<AnyOption>, rawInput: string): boolean => {
    if (!rawInput) return true;
    const needle = rawInput.toLowerCase();
    const data = option.data;
    // user options carry a pre-lowercased search string; sentinels match on label
    if (data.user) return data.search.includes(needle);
    return data.label.toLowerCase().includes(needle);
};

/** value -> option lookup so selected-value resolution is O(1), not O(n·m). */
const useOptionMap = (options: AnyOption[]) =>
    useMemo(() => new Map<string | number, AnyOption>(options.map(o => [o.value, o])), [options]);

const buildStyles = (compact: boolean): StylesConfig<AnyOption, boolean> => ({
    control: (base, state) => ({
        ...base,
        minHeight: compact ? '32px' : '38px',
        fontSize: '0.875rem',
        borderRadius: '0.375rem',
        borderColor: state.isFocused ? '#0ea5e9' : '#cbd5e1',
        boxShadow: state.isFocused ? '0 0 0 1px #0ea5e9' : 'none',
        '&:hover': { borderColor: state.isFocused ? '#0ea5e9' : '#94a3b8' },
    }),
    valueContainer: (base) => ({ ...base, padding: compact ? '0 6px' : '2px 8px' }),
    indicatorsContainer: (base) => ({ ...base, height: compact ? '32px' : '38px' }),
    option: (base, state) => ({
        ...base,
        fontSize: '0.875rem',
        color: '#334155',
        backgroundColor: state.isSelected ? '#e0f2fe' : state.isFocused ? '#f1f5f9' : 'white',
        cursor: 'pointer',
        padding: '8px 12px',
    }),
    multiValue: (base) => ({
        ...base,
        backgroundColor: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: '9999px',
        overflow: 'hidden',
    }),
    multiValueLabel: (base) => ({ ...base, color: '#075985', fontSize: '0.75rem', padding: '2px 4px 2px 8px' }),
    multiValueRemove: (base) => ({
        ...base,
        color: '#0369a1',
        borderRadius: '9999px',
        '&:hover': { backgroundColor: '#7dd3fc', color: '#fff' },
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

const TwoLineOption = (props: OptionProps<AnyOption, boolean>) => {
    const { data } = props;
    return (
        <components.Option {...props}>
            <div className="flex flex-col">
                <span>{data.label}</span>
                {data.secondary && (
                    <span className="text-xs text-slate-400 mt-0.5 truncate">{data.secondary}</span>
                )}
            </div>
        </components.Option>
    );
};

// Chips show a first-letter avatar + name to stay compact; email is visible in
// the dropdown.
const ChipLabel = (props: MultiValueGenericProps<AnyOption, true>) => {
    const label = (props.data as AnyOption).label;
    return (
        <components.MultiValueLabel {...props}>
            <span className="inline-flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-primary-600 text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                    {label.charAt(0).toUpperCase()}
                </span>
                {label}
            </span>
        </components.MultiValueLabel>
    );
};

const portalProps = {
    menuPortalTarget: typeof document !== 'undefined' ? document.body : undefined,
    menuPosition: 'fixed' as const,
};

// ---- Single ----------------------------------------------------------------

interface UserSelectProps {
    /** Selected user id, a sentinel string, or null for "no selection". */
    value: number | string | null;
    onChange: (value: number | string | null) => void;
    users: AppUser[];
    /** Pinned options rendered above the user list (e.g. Unassigned). */
    sentinels?: SentinelOption[];
    placeholder?: string;
    allowClear?: boolean;
    disabled?: boolean;
    compact?: boolean;
    className?: string;
    ariaLabel?: string;
}

export function UserSelect({
    value,
    onChange,
    users,
    sentinels = [],
    placeholder = '未指定',
    allowClear = true,
    disabled = false,
    compact = false,
    className,
    ariaLabel,
}: UserSelectProps) {
    const styles = useMemo(() => buildStyles(compact), [compact]);
    const options = useMemo<AnyOption[]>(
        () => [...sentinels, ...users.map(toOption)],
        [sentinels, users],
    );
    const byValue = useOptionMap(options);
    const selected = useMemo<AnyOption | null>(
        () => (value === null || value === '' ? null : byValue.get(value) ?? null),
        [value, byValue],
    );

    return (
        <div className={className}>
            <Select<AnyOption, false>
                options={options}
                value={selected}
                onChange={opt => onChange(opt ? opt.value : null)}
                placeholder={placeholder}
                isClearable={allowClear}
                isDisabled={disabled}
                isSearchable
                noOptionsMessage={() => '查無使用者'}
                components={{ Option: TwoLineOption }}
                styles={styles}
                aria-label={ariaLabel}
                filterOption={filterOption}
                {...portalProps}
            />
        </div>
    );
}

// ---- Multi -----------------------------------------------------------------

interface UserMultiSelectProps {
    value: number[];
    onChange: (ids: number[]) => void;
    users: AppUser[];
    placeholder?: string;
    disabled?: boolean;
    compact?: boolean;
    className?: string;
    ariaLabel?: string;
}

export function UserMultiSelect({
    value,
    onChange,
    users,
    placeholder = '新增指派人員...',
    disabled = false,
    compact = false,
    className,
    ariaLabel,
}: UserMultiSelectProps) {
    const styles = useMemo(() => buildStyles(compact), [compact]);
    const options = useMemo<AnyOption[]>(() => users.map(toOption), [users]);
    const byValue = useOptionMap(options);
    const selected = useMemo<AnyOption[]>(
        () => value.map(id => byValue.get(id)).filter(Boolean) as AnyOption[],
        [value, byValue],
    );

    return (
        <div className={className}>
            <Select<AnyOption, true>
                isMulti
                options={options}
                value={selected}
                onChange={opts => onChange((opts ?? []).map(o => o.value as number))}
                placeholder={placeholder}
                isDisabled={disabled}
                isSearchable
                closeMenuOnSelect={false}
                noOptionsMessage={() => '查無使用者'}
                components={{ Option: TwoLineOption, MultiValueLabel: ChipLabel }}
                styles={styles}
                aria-label={ariaLabel}
                filterOption={filterOption}
                {...portalProps}
            />
        </div>
    );
}
