import React, { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Folder, ChevronRight, ChevronDown, Plus, Edit2, Trash2 } from 'lucide-react';

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
    childrenNodes?: React.ReactNode;
}

export default function RunFolderNode({
    folder,
    level,
    isActive,
    onSelect,
    onAddSubFolder,
    onEdit,
    onDelete,
    childrenNodes
}: RunFolderNodeProps) {
    const [isExpanded, setIsExpanded] = useState(true);

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
                    {/* No checkbox for folders right now unless batch operations are needed implicitly */}
                    <Folder className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? 'text-primary-500' : 'text-slate-400 group-hover:text-primary-500'}`} />
                    <span className="text-sm font-medium truncate">{folder.name}</span>
                </div>

                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-inherit pl-1 pointer-events-auto shrink-0 pr-1">
                    {onAddSubFolder && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onAddSubFolder(folder.id); setIsExpanded(true); }}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            title="Add subfolder"
                        >
                            <Plus className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {onEdit && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onEdit(folder); }}
                            className="p-1 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                            title="Edit folder"
                        >
                            <Edit2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {onDelete && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(folder.id); }}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete folder"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
