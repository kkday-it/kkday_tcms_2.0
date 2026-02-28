import React from 'react';
import CreatableSelect from 'react-select/creatable';

interface TagInputProps {
    value: string; // Comma-separated string of tags
    onChange: (value: string) => void;
    availableOptions: string[];
    placeholder?: string;
    label?: string;
}

export default function TagInput({ value, onChange, availableOptions, placeholder = "Add...", label = "Tags" }: TagInputProps) {
    // Convert comma-separated string to react-select option format
    const tags = value.split(',').map(t => t.trim()).filter(Boolean);
    const valueOptions = tags.map(tag => ({ label: tag, value: tag }));

    // Convert available options to react-select option format
    const selectOptions = availableOptions.map(opt => ({ label: opt, value: opt }));

    const handleChange = (newValue: any) => {
        // newValue is an array of selected options
        const newTagsString = newValue ? newValue.map((v: any) => v.value).join(', ') : '';
        onChange(newTagsString);
    };

    const customStyles = {
        control: (provided: any, state: any) => ({
            ...provided,
            minHeight: '38px',
            borderRadius: '0.375rem',
            borderColor: state.isFocused ? '#0ea5e9' : '#e2e8f0', // primary-500 / slate-200
            boxShadow: state.isFocused ? '0 0 0 1px #0ea5e9' : provided.boxShadow,
            '&:hover': {
                borderColor: state.isFocused ? '#0ea5e9' : '#cbd5e1' // slate-300
            }
        }),
        multiValue: (provided: any) => ({
            ...provided,
            backgroundColor: '#f1f5f9', // slate-100
            border: '1px solid #e2e8f0', // slate-200
            borderRadius: '0.375rem',
        }),
        multiValueLabel: (provided: any) => ({
            ...provided,
            color: '#334155', // slate-700
            fontWeight: 500,
            fontSize: '0.75rem',
            padding: '2px 6px',
        }),
        multiValueRemove: (provided: any) => ({
            ...provided,
            color: '#64748b', // slate-500
            ':hover': {
                backgroundColor: '#e2e8f0', // slate-200
                color: '#e11d48', // rose-600
            },
        }),
        option: (provided: any, state: any) => ({
            ...provided,
            fontSize: '0.875rem',
            backgroundColor: state.isFocused ? '#f8fafc' : 'white', // slate-50
            color: '#334155', // slate-700
            cursor: 'pointer',
            ':active': {
                backgroundColor: '#f1f5f9',
            },
        }),
        menu: (provided: any) => ({
            ...provided,
            zIndex: 9999,
            borderRadius: '0.375rem',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
            border: '1px solid #e2e8f0',
        })
    };

    return (
        <div className="relative flex flex-col w-full">
            <label className="block text-sm font-semibold text-slate-900 mb-1.5">{label}</label>
            {/* @ts-ignore React Select typing mismatch in this environment */}
            <CreatableSelect
                isMulti
                options={selectOptions}
                value={valueOptions}
                onChange={handleChange}
                placeholder={placeholder}
                classNamePrefix="react-select"
                styles={customStyles}
                formatCreateLabel={(inputValue) => `Create "${inputValue}"`}
                noOptionsMessage={() => "No more options. Type to create."}
            />
        </div>
    );
}
