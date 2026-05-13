import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { Bold, Italic, UnderlineIcon, List, ListOrdered, Minus, ImagePlus, Loader2 } from 'lucide-react';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import api from '../../lib/api';

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
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);

    // Upload one image File to /uploads/ and return the resulting public URL,
    // or null on failure (caller surfaces the error). Used by both the toolbar
    // button (file picker) and the paste handler (KQT-15185/15186).
    const uploadImage = useCallback(async (file: File): Promise<string | null> => {
        if (!file.type.startsWith('image/')) return null;
        const form = new FormData();
        form.append('file', file);
        try {
            const res = await api.post('/uploads/', form, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            return res.data?.url ?? null;
        } catch (err) {
            console.error('Image upload failed', err);
            return null;
        }
    }, []);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: false,
                codeBlock: false,
            }),
            Underline,
            Placeholder.configure({ placeholder }),
            // KQT-15186: allow <img> to round-trip through the editor instead of
            // being stripped by tiptap's schema (which previously forced callers
            // to downgrade <img> to <a>📎 Image</a> in cleanHtml).
            Image.configure({
                inline: false,
                allowBase64: false,
                HTMLAttributes: { class: 'max-w-full h-auto rounded' },
            }),
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
            // KQT-15185: paste-from-clipboard. When the user pastes a screenshot
            // (Ctrl+V / Cmd+V), find any image entries in the clipboard, upload
            // each, and insert at the current cursor position. We swallow the
            // event only when we actually consumed an image so other paste
            // behaviour (text, HTML) keeps working unchanged.
            handlePaste(view, event) {
                const items = event.clipboardData?.items;
                if (!items || items.length === 0) return false;
                const imageFiles: File[] = [];
                for (let i = 0; i < items.length; i++) {
                    const it = items[i];
                    if (it.kind === 'file' && it.type.startsWith('image/')) {
                        const f = it.getAsFile();
                        if (f) imageFiles.push(f);
                    }
                }
                if (imageFiles.length === 0) return false;
                event.preventDefault();
                (async () => {
                    setIsUploading(true);
                    try {
                        for (const f of imageFiles) {
                            const url = await uploadImage(f);
                            if (url) {
                                const { state, dispatch } = view;
                                const node = state.schema.nodes.image.create({ src: url });
                                dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
                            }
                        }
                    } finally {
                        setIsUploading(false);
                    }
                })();
                return true;
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

    const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // Reset so picking the same file twice still triggers onChange.
        e.target.value = '';
        if (!file) return;
        setIsUploading(true);
        try {
            const url = await uploadImage(file);
            if (url) {
                editor.chain().focus().setImage({ src: url }).run();
            } else {
                alert('Image upload failed');
            }
        } finally {
            setIsUploading(false);
        }
    };

    const ToolbarBtn = ({
        onClick,
        active,
        title,
        children,
        disabled,
    }: {
        onClick: () => void;
        active?: boolean;
        title: string;
        children: React.ReactNode;
        disabled?: boolean;
    }) => (
        <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); if (!disabled) onClick(); }}
            title={title}
            disabled={disabled}
            className={`p-1 rounded transition-colors ${active
                ? 'bg-primary-100 text-primary-700'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                <div className="w-px h-4 bg-slate-200 mx-1" />
                <ToolbarBtn
                    onClick={() => fileInputRef.current?.click()}
                    active={false}
                    title="Insert image (or paste from clipboard)"
                    disabled={isUploading}
                >
                    {isUploading
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <ImagePlus className="w-3.5 h-3.5" />}
                </ToolbarBtn>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFilePicked}
                />
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
