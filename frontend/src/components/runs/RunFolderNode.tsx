import React, { useState, useRef, useEffect } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Folder, ChevronRight, ChevronDown, Plus, Edit2, Trash2, Copy, MoreHorizontal, Link2, Check } from 'lucide-react';
import { canWrite } from '../../lib/permissions';

interface TestRunFolder {
    id: number;
    name: string;
    parent_id?: number | null;
}

interface RunFolderNodeProps {
    folder: TestRunFolder;
    level: number;
    isActive: boolean;
    onSelect: (id: number) => void;
    onAddSubFolder?: (folderId: number) => void;
    onEdit?: (folder: TestRunFolder) => void;
    onDelete?: (folderId: number) => void;
    onCopyFolder?: (folderId: number) => void;
    onShareLink?: (folderId: number) => void;
    copiedFolderId?: number | null;
    childrenNodes?: React.ReactNode;
    runCount?: number;
}

export default function RunFolderNode({
    folder,
    level,
    isActive,
    onSelect,
    onAddSubFolder,
    onEdit,
    onDelete,
    onCopyFolder,
    onShareLink,
    copiedFolderId,
    childrenNodes,
    runCount,
}: RunFolderNodeProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    // Hide write actions for non-Admin/QA — backend still enforces (PR-3).
    const writable = canWrite();

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // 選中時自動展開以顯示子資料夾
    React.useEffect(() => {
        if (isActive) setIsExpanded(true);
    }, [isActive]);

    const { attributes, listeners, setNodeRef: setDraggableRef, transform, isDragging } = useDraggable({
        id: `folder-${folder.id}`,
        data: { type: 'folder', folder }
    });

    const { setNodeRef: setDroppableRef, isOver } = useDroppable({
        id: `folder-${folder.id}`,
        data: { type: 'folder', folder }
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
                onClick={() => onSelect(folder.id)}
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
                    <Folder className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? 'text-primary-500' : 'text-slate-400 group-hover:text-primary-500'}`} />
                    <span className="text-sm font-medium truncate">{folder.name}</span>
                    {runCount !== undefined && runCount > 0 && (
                        <span className="ml-1 text-xs text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                            {runCount}
                        </span>
                    )}
                </div>

                <div className={`relative transition-opacity pointer-events-auto shrink-0 pr-1 ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} ref={menuRef}>
                    <button
                        onClick={(e) => { e.stopPropagation(); setIsMenuOpen(prev => !prev); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded transition-colors focus:outline-none"
                        title="更多操作"
                    >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                    {isMenuOpen && (
                        <div className="absolute right-0 bottom-full mb-0.5 w-40 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
                            {writable && onCopyFolder && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onCopyFolder(folder.id); }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                >
                                    <Copy className="w-3.5 h-3.5 text-emerald-500" /> 批次複製
                                </button>
                            )}
                            {writable && onAddSubFolder && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onAddSubFolder(folder.id); setIsExpanded(true); }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                >
                                    <Plus className="w-3.5 h-3.5 text-primary-500" /> 新增子資料夾
                                </button>
                            )}
                            {writable && onEdit && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onEdit(folder); }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                >
                                    <Edit2 className="w-3.5 h-3.5 text-blue-500" /> 編輯資料夾
                                </button>
                            )}
                            {onShareLink && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onShareLink(folder.id); }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                >
                                    {copiedFolderId === folder.id
                                        ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                                        : <Link2 className="w-3.5 h-3.5 text-slate-500" />
                                    }
                                    {copiedFolderId === folder.id ? '已複製！' : '複製連結'}
                                </button>
                            )}
                            {writable && onDelete && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onDelete(folder.id); }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> 刪除資料夾
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
            {isExpanded && childrenNodes && (
                <div className="pl-2 mt-0.5">
                    {childrenNodes}
                </div>
            )}
        </div>
    );
}
