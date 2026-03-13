import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, UnderlineIcon, List, ListOrdered, Minus } from 'lucide-react';
import React, { useEffect } from 'react';

interface RichTextEditorProps {
    value: string;       // HTML string
    onChange: (html: string) => void;
    placeholder?: string;
    minHeight?: string;
    className?: string;
}

function RichTextEditor({
    value,
    onChange,
    placeholder = 'Enter content...',
    minHeight = '80px',
    className = '',
}: RichTextEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: false,
                codeBlock: false,
            }),
            Underline,
            Placeholder.configure({ placeholder }),
        ],
        content: value || '',
        onUpdate({ editor }) {
            const html = editor.getHTML();
            onChange(html === '<p></p>' ? '' : html);
        },
        editorProps: {
            attributes: {
                class: 'focus:outline-none',
            },
        },
    });

    // Sync external value changes
    useEffect(() => {
        if (!editor) return;
        const current = editor.getHTML();
        const incoming = value || '';
        if (current !== incoming && !(current === '<p></p>' && incoming === '')) {
            editor.commands.setContent(incoming, false);
        }
    }, [value, editor]);

    if (!editor) return null;

    const ToolbarBtn = ({
        onClick,
        active,
        title,
        children,
    }: {
        onClick: () => void;
        active?: boolean;
        title: string;
        children: React.ReactNode;
    }) => (
        <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onClick(); }}
            title={title}
            className={`p-1 rounded transition-colors ${active
                ? 'bg-primary-100 text-primary-700'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
        >
            {children}
        </button>
    );

    return (
        <div className={`flex flex-col border border-slate-200 rounded-md bg-white transition-all focus-within:ring-2 focus-within:ring-primary-100 focus-within:border-primary-500 ${className}`}>
            {/* Toolbar */}
            <div className="flex items-center gap-0.5 px-2 py-1 border-b border-slate-100 bg-slate-50/50 rounded-t-md">
                <ToolbarBtn
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    active={editor.isActive('bold')}
                    title="Bold"
                >
                    <Bold className="w-3.5 h-3.5" />
                </ToolbarBtn>
                <ToolbarBtn
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    active={editor.isActive('italic')}
                    title="Italic"
                >
                    <Italic className="w-3.5 h-3.5" />
                </ToolbarBtn>
                <ToolbarBtn
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    active={editor.isActive('underline')}
                    title="Underline"
                >
                    <UnderlineIcon className="w-3.5 h-3.5" />
                </ToolbarBtn>
                <div className="w-px h-4 bg-slate-200 mx-1" />
                <ToolbarBtn
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    active={editor.isActive('bulletList')}
                    title="Bullet list"
                >
                    <List className="w-3.5 h-3.5" />
                </ToolbarBtn>
                <ToolbarBtn
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    active={editor.isActive('orderedList')}
                    title="Numbered list"
                >
                    <ListOrdered className="w-3.5 h-3.5" />
                </ToolbarBtn>
                <div className="w-px h-4 bg-slate-200 mx-1" />
                <ToolbarBtn
                    onClick={() => editor.chain().focus().setHorizontalRule().run()}
                    active={false}
                    title="Horizontal rule"
                >
                    <Minus className="w-3.5 h-3.5" />
                </ToolbarBtn>
            </div>

            {/* Editor area */}
            <div
                className="overflow-y-auto px-3 py-2"
                style={{ minHeight }}
                onClick={() => editor.commands.focus()}
            >
                <EditorContent
                    editor={editor}
                    className="prose prose-sm max-w-none text-sm text-slate-900"
                />
            </div>
        </div>
    );
}

export default React.memo(RichTextEditor);
