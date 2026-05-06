import React, { useState, useRef, useEffect } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Folder, ChevronRight, ChevronDown, Plus, Edit2, Trash2, MoreHorizontal, Link2, Check } from 'lucide-react';

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
    onEdit: (suite: TestSuite) => void;
    onDelete: (id: number) => void;
    onAddSubFolder?: (id: number) => void;
    onShareLink?: (id: number) => void;
    copiedSuiteId?: number | null;
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
    onAddSubFolder,
    onShareLink,
    copiedSuiteId,
    childrenNodes
}: SuiteNodeProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const { attributes, listeners, setNodeRef: setDraggableRef, transform, isDragging } = useDraggable({
        id: suite.id,
        data: { type: 'suite', suite }
    });

    const { setNodeRef: setDroppableRef, isOver } = useDroppable({
        id: suite.id,
        data: { type: 'suite', suite }
    });

    const paddingLeft = level * 16 + 4;
    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        paddingLeft: `${paddingLeft}px`,
        paddingRight: '8px',
        position: 'relative' as const,
        zIndex: isDragging ? 50 : isMenuOpen ? 40 : 1,
    };

    const isCopied = copiedSuiteId === suite.id;

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
                <div className="flex items-center gap-1 shrink-0">
                    {/* Case count: always visible */}
                    {(suite.cases ?? 0) > 0 && (
                        <span className="text-xs text-slate-400 w-5 text-right pointer-events-none">{suite.cases}</span>
                    )}
                    {/* MoreHorizontal context menu */}
                    <div
                        className={`relative transition-opacity pointer-events-auto shrink-0 pr-1 ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        ref={menuRef}
                    >
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsMenuOpen(prev => !prev); }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded transition-colors focus:outline-none"
                            title="更多操作"
                        >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                        {isMenuOpen && (
                            <div className="absolute right-0 top-full mt-0.5 w-40 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
                                {onAddSubFolder && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onAddSubFolder(suite.id); setIsExpanded(true); }}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                    >
                                        <Plus className="w-3.5 h-3.5 text-primary-500" /> 新增子資料夾
                                    </button>
                                )}
                                <button
                                    onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onEdit(suite); }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                >
                                    <Edit2 className="w-3.5 h-3.5 text-blue-500" /> 編輯資料夾
                                </button>
                                {onShareLink && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onShareLink(suite.id); }}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                    >
                                        {isCopied
                                            ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                                            : <Link2 className="w-3.5 h-3.5 text-slate-500" />
                                        }
                                        {isCopied ? '已複製！' : '複製連結'}
                                    </button>
                                )}
                                <button
                                    onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onDelete(suite.id); }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> 刪除資料夾
                                </button>
                            </div>
                        )}
                    </div>
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
