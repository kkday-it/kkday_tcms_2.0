import React, { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Folder, Edit2, Trash2, ChevronRight, ChevronDown } from 'lucide-react';

interface TestSuite {
    id: number;
    name: string;
    description?: string;
    cases?: number;
    parent_suite_id?: number | null;
}

interface SuiteNodeProps {
    suite: TestSuite;
    level: number;
    isActive: boolean;
    isSelected: boolean;
    onSelect: (id: number) => void;
    onToggleSelection: (e: React.MouseEvent, id: number) => void;
    onEdit: (e: React.MouseEvent, suite: TestSuite) => void;
    onDelete: (e: React.MouseEvent, id: number) => void;
    childrenNodes?: React.ReactNode;
}

export default function SuiteNode({
    suite,
    level,
    isActive,
    isSelected,
    onSelect,
    onToggleSelection,
    onEdit,
    onDelete,
    childrenNodes
}: SuiteNodeProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const { attributes, listeners, setNodeRef: setDraggableRef, transform, isDragging } = useDraggable({
        id: suite.id,
        data: { type: 'suite', suite }
    });

    const { setNodeRef: setDroppableRef, isOver } = useDroppable({
        id: suite.id,
        data: { type: 'suite', suite }
    });

    // Reduce padding left slightly to make room for the chevron
    const paddingLeft = level * 16 + 4;
    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        paddingLeft: `${paddingLeft}px`,
        paddingRight: '8px',
        position: 'relative' as const,
        zIndex: isDragging ? 50 : 1,
    };

    return (
        <div>
            <div
                ref={(node) => {
                    setDraggableRef(node);
                    setDroppableRef(node);
                }}
                style={style}
                {...attributes}
                {...listeners}
                onClick={() => onSelect(suite.id)}
                className={`group flex items-center justify-between py-1.5 cursor-grab active:cursor-grabbing rounded transition-colors ${isOver ? 'ring-2 ring-primary-400 bg-primary-100 z-10' :
                    isActive ? 'bg-primary-50 text-primary-700' : 'text-slate-700 hover:text-primary-700 hover:bg-primary-50'
                    }`}
            >
                <div className="flex items-center gap-1.5 overflow-hidden pointer-events-none">
                    <div className="pointer-events-auto flex items-center justify-center w-4 h-4">
                        {childrenNodes ? (
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                                onPointerDown={(e) => e.stopPropagation()}
                                className="p-0.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded transition-colors"
                            >
                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                        ) : (
                            <div className="w-3.5 h-3.5" />
                        )}
                    </div>
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => { e.stopPropagation(); onToggleSelection(e as any, suite.id); }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-3.5 h-3.5 text-primary-600 rounded border-slate-300 focus:ring-primary-500 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto shrink-0"
                        style={{ opacity: isSelected ? 1 : undefined }}
                    />
                    <Folder className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? 'text-primary-500' : 'text-slate-400 group-hover:text-primary-500'}`} />
                    <span className="text-sm font-medium truncate">{suite.name}</span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-inherit pl-1 pointer-events-auto shrink-0">
                    <button
                        onClick={(e) => onEdit(e, suite)}
                        className="p-1 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded"
                        title="Edit/Move Suite"
                    >
                        <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={(e) => onDelete(e, suite.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                        title="Delete Suite"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs text-slate-400 ml-1 pointer-events-none w-4 text-right">{suite.cases || 0}</span>
                </div>
            </div>
            {childrenNodes && isExpanded && (
                <div className="flex flex-col">
                    {childrenNodes}
                </div>
            )}
        </div>
    );
}
