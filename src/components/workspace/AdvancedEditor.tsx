"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEditor, EditorContent } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Image } from '@tiptap/extension-image';
import { Link } from '@tiptap/extension-link';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { CharacterCount } from '@tiptap/extension-character-count';
import { Typography } from '@tiptap/extension-typography';
import { 
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, 
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Heading1, Heading2, Heading3,
  Quote, Minus, Table as TableIcon, Image as LucideImage,
  Link2, CheckSquare, Sparkles, Type, RotateCcw, RotateCw,
  MoreHorizontal, Trash2, ChevronDown, Plus, Wand2,
  Undo, Redo, Layout, Rows, Columns, PlusSquare, 
  ArrowDownToLine, ArrowUpToLine, Trash, TableProperties
} from 'lucide-react';
import { cn } from '@/lib/utils';
import React, { useState, useEffect, useRef } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AdvancedEditorProps {
  content: string;
  onChange: (html: string) => void;
  onSave?: () => void;
  className?: string;
  hideToolbar?: boolean;
  onEditorReady?: (editor: any) => void;
}

export function AdvancedEditor({ content, onChange, onSave, className, hideToolbar, onEditorReady }: AdvancedEditorProps) {
  const [showBorders, setShowBorders] = useState(true);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextStyle.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            fontSize: {
              default: null,
              parseHTML: element => element.style.fontSize,
              renderHTML: attributes => {
                if (!attributes.fontSize) return {};
                return { style: `font-size: ${attributes.fontSize}` };
              },
            },
            fontFamily: {
              default: null,
              parseHTML: element => element.style.fontFamily,
              renderHTML: attributes => {
                if (!attributes.fontFamily) return {};
                return { style: `font-family: ${attributes.fontFamily}` };
              },
            },
          };
        },
      }),
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Image.extend({
        inline: true,
        group: 'inline',
        addAttributes() {
          return {
            ...this.parent?.(),
            width: {
              default: 'fit-content',
              renderHTML: attributes => ({
                style: `width: ${attributes.width}; max-width: 100%;`,
              }),
            },
            marginLeft: {
              default: '0px',
              renderHTML: attributes => ({
                style: `margin-left: ${attributes.marginLeft};`,
              }),
            },
            float: {
              default: 'none',
              renderHTML: attributes => ({
                style: `float: ${attributes.float}; margin: ${attributes.float === 'none' ? '2rem auto' : attributes.float === 'left' ? '0.5rem 2rem 1rem 0' : '0.5rem 0 1rem 2rem'};`,
              }),
            },
            crop: {
              default: '0% 0% 0% 0%',
              renderHTML: attributes => ({
                style: `clip-path: inset(${attributes.crop});`,
              }),
            }
          }
        },
        addNodeView() {
          return ({ node, editor, getPos }) => {
          const container = document.createElement('span')
            container.style.position = 'relative'
            container.style.display = 'inline-flex'
            container.style.verticalAlign = 'middle'
            container.style.float = node.attrs.float !== 'none' ? node.attrs.float : 'none'
            container.style.width = 'fit-content'
            container.style.margin = node.attrs.float === 'none' ? '0 0.5rem' : '0.5rem 1.5rem 0.5rem 0'
            container.style.overflow = 'visible'
            container.style.zIndex = '50'
            container.className = `image-node-container float-${node.attrs.float}`
            
            const img = document.createElement('img')
            img.src = node.attrs.src
            img.style.width = node.attrs.width || 'fit-content'
            img.style.marginLeft = node.attrs.marginLeft || '0px'
            img.style.maxWidth = '100%'
            img.style.borderRadius = '1rem'
            img.style.border = '2px solid var(--theme-border)'
            img.style.boxShadow = '0 25px 50px -12px rgb(0 0 0 / 0.25)'
            img.style.display = 'block'
            img.style.transition = 'filter 0.3s'
            img.style.clipPath = `inset(${node.attrs.crop})`
            
            // CROP GRID
            const grid = document.createElement('div')
            grid.style.position = 'absolute'
            grid.style.inset = '0'
            grid.style.border = '2px dashed #10b981'
            grid.style.display = 'none'
            grid.style.pointerEvents = 'none'
            grid.style.zIndex = '60'
            grid.innerHTML = `
              <div style="position:absolute;top:33%;left:0;right:0;height:1px;background:#10b981;opacity:0.5"></div>
              <div style="position:absolute;top:66%;left:0;right:0;height:1px;background:#10b981;opacity:0.5"></div>
              <div style="position:absolute;left:33%;top:0;bottom:0;width:1px;background:#10b981;opacity:0.5"></div>
              <div style="position:absolute;left:66%;top:0;bottom:0;width:1px;background:#10b981;opacity:0.5"></div>
            `
            
            const resizeHandle = document.createElement('div')
            resizeHandle.style.position = 'absolute'
            resizeHandle.style.bottom = '-10px'
            resizeHandle.style.right = '-10px'
            resizeHandle.style.width = '32px'
            resizeHandle.style.height = '32px'
            resizeHandle.style.backgroundColor = '#ef4444' // Bright Red
            resizeHandle.style.borderRadius = '50%'
            resizeHandle.style.border = '3px solid white'
            resizeHandle.style.boxShadow = '0 10px 15px -3px rgba(239, 68, 68, 0.4)'
            resizeHandle.style.cursor = 'nwse-resize'
            resizeHandle.style.zIndex = '100'
            resizeHandle.style.display = 'flex'
            resizeHandle.style.alignItems = 'center'
            resizeHandle.style.justifyContent = 'center'
            resizeHandle.style.color = 'white'
            resizeHandle.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 19l-7-7 7-7"/><path d="M19 15l-7-7-7 7"/></svg>'
            
            resizeHandle.onmousedown = (e: MouseEvent) => {
              e.preventDefault()
              e.stopPropagation()
              const startX = e.clientX
              const startWidth = img.offsetWidth
              const onMouseMove = (e: MouseEvent) => {
                const deltaX = e.clientX - startX
                const newWidth = Math.max(50, startWidth + deltaX)
                img.style.width = `${newWidth}px`
              }
              const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove as any)
                document.removeEventListener('mouseup', onMouseUp)
                const pos = typeof getPos === 'function' ? getPos() : null
                if (typeof pos === 'number') {
                  editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    width: img.style.width,
                  }))
                }
              }
              document.addEventListener('mousemove', onMouseMove as any)
              document.addEventListener('mouseup', onMouseUp)
            }
            
            // LISTEN FOR GLOBAL CROP TOGGLE
            const toggleCrop = () => {
              if (editor.isActive('image')) {
                const isCropping = grid.style.display === 'block'
                grid.style.display = isCropping ? 'none' : 'block'
                img.style.filter = isCropping ? 'none' : 'brightness(0.5)'
              }
            }
            
            (window as any).tiptapToggleCrop = toggleCrop;

            container.appendChild(img)
            container.appendChild(grid)
            container.appendChild(resizeHandle)
            
            return {
              dom: container,
            }
          }
        }
      }).configure({
        allowBase64: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-emerald-600 underline decoration-emerald-500/30 underline-offset-4 font-bold hover:text-emerald-700 transition-colors',
        },
      }),
      Placeholder.configure({
        placeholder: 'Start writing your document...',
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      CharacterCount,
      Typography,
    ],
    content: content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-slate dark:prose-invert max-w-none focus:outline-none min-h-[600px] pb-32 w-full [&_table]:border-collapse [&_table]:w-full [&_table]:border-2 [&_table]:border-slate-800 [&_td]:border-2 [&_td]:border-slate-800 [&_th]:border-2 [&_th]:border-slate-800 [&_td]:p-4 [&_th]:p-4 [&_th]:bg-slate-50 [&_table]:my-8',
      },
      handleKeyDown: (view, event) => {
        // CTRL + I SHORTCUT FOR QUICK INSERT
        if (event.ctrlKey && event.key === 'i') {
          event.preventDefault();
          // Move to a new line and focus it to trigger FloatingMenu
          editor?.chain().focus().insertContent('<p></p>').run();
          return true;
        }

        if (editor?.isActive('image')) {
          const { selection } = editor.state;
          const isImageSelected = selection instanceof NodeSelection && (selection as any).node.type.name === 'image';
          
          if (isImageSelected) {
            const node = (selection as any).node;
            const pos = selection.from;

            if (event.key === 'ArrowLeft') {
              const currentMargin = parseInt(node.attrs.marginLeft) || 0;
              const newMargin = Math.max(0, currentMargin - 20);
              editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                marginLeft: `${newMargin}px`,
              }));
              return true;
            }
            if (event.key === 'ArrowRight') {
              const currentMargin = parseInt(node.attrs.marginLeft) || 0;
              const newMargin = currentMargin + 20;
              editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                marginLeft: `${newMargin}px`,
              }));
              return true;
            }
            if (event.key === 'ArrowUp') {
              const $pos = editor.state.doc.resolve(pos);
              const prevNode = $pos.nodeBefore;
              if (prevNode) {
                const tr = view.state.tr;
                const prevSize = prevNode.nodeSize;
                tr.delete(pos, pos + node.nodeSize);
                tr.insert(pos - prevSize, node);
                tr.setSelection(NodeSelection.create(tr.doc, pos - prevSize));
                view.dispatch(tr);
              }
              return true;
            }
            if (event.key === 'ArrowDown') {
              const $pos = editor.state.doc.resolve(pos + node.nodeSize);
              const nextNode = $pos.nodeAfter;
              if (nextNode) {
                const tr = view.state.tr;
                const nextSize = nextNode.nodeSize;
                tr.delete(pos, pos + node.nodeSize);
                tr.insert(pos + nextSize, node);
                tr.setSelection(NodeSelection.create(tr.doc, pos + nextSize));
                view.dispatch(tr);
              }
              return true;
            }
          }
        }
        return false;
      },
    },
  });

  // Keep editor content in sync with external changes (e.g. from AI)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const readyRef = useRef(false);
  useEffect(() => {
    if (editor && onEditorReady && !readyRef.current) {
      onEditorReady(editor);
      readyRef.current = true;
    }
  }, [editor, onEditorReady]);

  if (!editor) return null;

  const MenuButton = ({ 
    onClick, 
    active, 
    disabled, 
    children, 
    title,
    variant = "default"
  }: { 
    onClick: () => void; 
    active?: boolean; 
    disabled?: boolean; 
    children: React.ReactNode;
    title?: string;
    variant?: "default" | "primary" | "danger" | "ghost";
  }) => (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      className={cn(
        "p-2 rounded-xl transition-all flex items-center justify-center min-w-[32px] h-8",
        variant === "default" && (active ? "bg-emerald-500 text-white shadow-lg scale-105" : "hover:bg-theme-raised text-theme-muted hover:text-theme-fg"),
        variant === "ghost" && "hover:bg-theme-raised text-theme-muted hover:text-theme-fg",
        variant === "danger" && "text-rose-500 hover:bg-rose-500/10",
        disabled && "opacity-20 cursor-not-allowed grayscale"
      )}
    >
      {children}
    </button>
  );

  const addImage = () => {
    // This is now handled in the parent ribbon for shared toolbar
  };

  return (
    <div className={cn("flex flex-col gap-8", className)}>
      {/* ADVANCED TOOLBAR */}
      {!hideToolbar && (
        <div className="flex flex-wrap items-center gap-1.5 p-3 bg-theme-surface border border-theme-border rounded-[1.5rem] sticky top-4 z-30 shadow-2xl backdrop-blur-xl bg-opacity-90">
          <div className="flex items-center gap-1 px-1">
            <MenuButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo (Ctrl+Z)">
              <Undo size={14} />
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo (Ctrl+Y)">
              <Redo size={14} />
            </MenuButton>
          </div>
          
          <div className="w-px h-6 bg-theme-border mx-1" />

          <div className="flex items-center gap-1 px-1">
            <MenuButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1">
              <Heading1 size={14} />
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
              <Heading2 size={14} />
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().setParagraph().run()} active={editor.isActive('paragraph')} title="Paragraph">
              <Type size={14} />
            </MenuButton>
          </div>

          <div className="w-px h-6 bg-theme-border mx-1" />

          {/* TYPOGRAPHY TOOLS */}
          <div className="flex items-center gap-1.5 px-2 py-1 bg-theme-page/50 rounded-xl border border-theme-border/50 shadow-inner">
            <Select
              value={editor.getAttributes('textStyle').fontFamily || "default"}
              onValueChange={(v) => {
                const family = v === "default" ? "" : v;
                editor.chain().focus().setMark('textStyle', { fontFamily: family }).run();
              }}
            >
              <SelectTrigger className="h-8 w-[130px] text-[11px]"><SelectValue placeholder="Default Font" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default Font</SelectItem>
                <SelectGroup>
                  <SelectLabel>Sans Serif</SelectLabel>
                  <SelectItem value="'Inter', sans-serif">Inter</SelectItem>
                  <SelectItem value="'Roboto', sans-serif">Roboto</SelectItem>
                  <SelectItem value="'Open Sans', sans-serif">Open Sans</SelectItem>
                  <SelectItem value="'Montserrat', sans-serif">Montserrat</SelectItem>
                  <SelectItem value="'Outfit', sans-serif">Outfit</SelectItem>
                  <SelectItem value="'Poppins', sans-serif">Poppins</SelectItem>
                  <SelectItem value="'Lato', sans-serif">Lato</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Serif</SelectLabel>
                  <SelectItem value="'Playfair Display', serif">Playfair Display</SelectItem>
                  <SelectItem value="'Merriweather', serif">Merriweather</SelectItem>
                  <SelectItem value="'Lora', serif">Lora</SelectItem>
                  <SelectItem value="'Libre Baskerville', serif">Baskerville</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Monospace</SelectLabel>
                  <SelectItem value="'Fira Code', monospace">Fira Code</SelectItem>
                  <SelectItem value="'Source Code Pro', monospace">Source Code</SelectItem>
                  <SelectItem value="'JetBrains Mono', monospace">JetBrains</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Creative</SelectLabel>
                  <SelectItem value="'Dancing Script', cursive">Handwriting</SelectItem>
                  <SelectItem value="'Pacifico', cursive">Pacifico</SelectItem>
                  <SelectItem value="'Righteous', cursive">Righteous</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select
              value={editor.getAttributes('textStyle').fontSize || ""}
              onValueChange={(v) => editor.chain().focus().setMark('textStyle', { fontSize: v }).run()}
            >
              <SelectTrigger className="h-8 w-[80px] text-[11px]"><SelectValue placeholder="Size" /></SelectTrigger>
              <SelectContent>
                {["12px", "14px", "16px", "18px", "20px", "24px", "32px", "40px", "48px", "64px"].map(sz =>
                  <SelectItem key={sz} value={sz}>{sz}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="w-px h-6 bg-theme-border mx-1" />

          <div className="flex items-center gap-1 px-1">
            <MenuButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
              <Bold size={14} />
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
              <Italic size={14} />
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
              <UnderlineIcon size={14} />
            </MenuButton>
          </div>

          <div className="w-px h-6 bg-theme-border mx-1" />

          <div className="flex items-center gap-1 px-1">
            <MenuButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left">
              <AlignLeft size={14} />
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align Center">
              <AlignCenter size={14} />
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right">
              <AlignRight size={14} />
            </MenuButton>
          </div>

          <div className="w-px h-6 bg-theme-border mx-1" />

          <div className="flex items-center gap-1 px-1">
            <MenuButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
              <List size={14} />
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered List">
              <ListOrdered size={14} />
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} title="Task List">
              <CheckSquare size={14} />
            </MenuButton>
          </div>

          <div className="w-px h-6 bg-theme-border mx-1" />

          <div className="flex items-center gap-1 px-1">
            <MenuButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">
              <Quote size={14} />
            </MenuButton>
            <MenuButton onClick={addImage} title="Insert Image">
              <LucideImage size={14} />
            </MenuButton>
            <MenuButton 
              onClick={() => {
                if (!editor.isActive('table')) {
                  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                } else {
                  editor.chain().focus().deleteTable().run();
                }
              }} 
              active={editor.isActive('table')} 
              title="Insert/Delete Table"
            >
              <TableIcon size={14} />
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">
              <Minus size={14} />
            </MenuButton>
          </div>

          {/* Table Specific Tools - Only show when in a table */}
          {editor.isActive('table') && (
            <>
              <div className="w-px h-6 bg-theme-border mx-1" />
              <div className="flex items-center gap-1 px-1 bg-emerald-500/5 rounded-xl border border-emerald-500/20 p-1">
                 <MenuButton onClick={() => editor.chain().focus().addColumnAfter().run()} title="Add Column"><PlusSquare size={14} className="rotate-90"/></MenuButton>
                 <MenuButton onClick={() => editor.chain().focus().addRowAfter().run()} title="Add Row"><PlusSquare size={14}/></MenuButton>
                 <MenuButton onClick={() => editor.chain().focus().deleteColumn().run()} title="Delete Column" variant="danger"><Trash size={14} className="rotate-90"/></MenuButton>
                 <MenuButton onClick={() => editor.chain().focus().deleteRow().run()} title="Delete Row" variant="danger"><Trash size={14}/></MenuButton>
                 <MenuButton onClick={() => editor.chain().focus().deleteTable().run()} title="Delete Table" variant="danger"><Trash2 size={14}/></MenuButton>
              </div>
            </>
          )}
        </div>
      )}

      {/* UNIFIED COMMAND CENTER - REPLACES BUBBLE AND FLOATING MENUS */}
      <BubbleMenu 
        editor={editor} 
        shouldShow={({ editor, state, from, to }) => {
          if (editor.isActive('image')) return false;
          const { $from } = state.selection;
          const isEmptyLine = $from.parent.content.size === 0;
          return (from !== to) || isEmptyLine;
        }}
      >
        <div className="flex items-center gap-0.5 p-1 bg-white/95 dark:bg-theme-surface/95 backdrop-blur-2xl border border-theme-border rounded-full shadow-[0_20px_50px_-12px_rgba(0,0,0,0.3)] animate-in zoom-in-95 duration-300 ring-4 ring-black/5">
          {/* FORMATTING SECTION (Visible on selection) */}
          {editor.state.selection.from !== editor.state.selection.to && (
            <div className="flex items-center gap-1 pr-2 mr-1 border-r border-theme-border/50">
              <Select
                value={editor.getAttributes('textStyle').fontFamily || ""}
                onValueChange={(v) => editor.chain().focus().setMark('textStyle', { fontFamily: v }).run()}
              >
                <SelectTrigger className="h-7 w-[100px] text-[10px]"><SelectValue placeholder="Font" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="'Inter', sans-serif">Inter</SelectItem>
                  <SelectItem value="'Playfair Display', serif">Playfair</SelectItem>
                  <SelectItem value="'Fira Code', monospace">Fira</SelectItem>
                  <SelectItem value="'Dancing Script', cursive">Hand</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={editor.getAttributes('textStyle').fontSize || ""}
                onValueChange={(v) => editor.chain().focus().setMark('textStyle', { fontSize: v }).run()}
              >
                <SelectTrigger className="h-7 w-[65px] text-[10px]"><SelectValue placeholder="Size" /></SelectTrigger>
                <SelectContent>
                  {["14px", "18px", "24px", "32px"].map(sz =>
                    <SelectItem key={sz} value={sz}>{sz.replace("px", "")}</SelectItem>
                  )}
                </SelectContent>
              </Select>

              <div className="w-px h-4 bg-theme-border mx-1" />

              <button onClick={() => editor.chain().focus().toggleBold().run()} className={cn("h-8 w-8 rounded-full flex items-center justify-center transition-all", editor.isActive('bold') ? "bg-emerald-500 text-white" : "hover:bg-theme-page text-theme-fg")}><Bold size={14} /></button>
              <button onClick={() => editor.chain().focus().toggleItalic().run()} className={cn("h-8 w-8 rounded-full flex items-center justify-center transition-all", editor.isActive('italic') ? "bg-emerald-500 text-white" : "hover:bg-theme-page text-theme-fg")}><Italic size={14} /></button>
              <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={cn("h-8 w-8 rounded-full flex items-center justify-center transition-all", editor.isActive('underline') ? "bg-emerald-500 text-white" : "hover:bg-theme-page text-theme-fg")}><UnderlineIcon size={14} /></button>
            </div>
          )}

          {/* INSERTION SECTION */}
          <div className="flex items-center gap-0.5">
            <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={cn("h-8 w-8 rounded-full flex items-center justify-center transition-all", editor.isActive('heading', { level: 1 }) ? "bg-blue-500 text-white" : "hover:bg-theme-page text-theme-fg")}><Heading1 size={14} /></button>
            <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={cn("h-8 w-8 rounded-full flex items-center justify-center transition-all", editor.isActive('heading', { level: 2 }) ? "bg-purple-500 text-white" : "hover:bg-theme-page text-theme-fg")}><Heading2 size={14} /></button>
            <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={cn("h-8 w-8 rounded-full flex items-center justify-center transition-all", editor.isActive('bulletList') ? "bg-emerald-500 text-white" : "hover:bg-theme-page text-theme-fg")}><List size={14} /></button>
            <button 
              onClick={() => {
                if (!editor.isActive('table')) {
                  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                } else {
                  editor.chain().focus().deleteTable().run();
                }
              }} 
              className={cn("h-8 w-8 rounded-full flex items-center justify-center transition-all", editor.isActive('table') ? "bg-emerald-500 text-white" : "hover:bg-theme-page text-theme-fg")}
            >
              <TableIcon size={14} />
            </button>
          </div>

          <div className="w-px h-3 bg-theme-border mx-1" />

          {/* AI ACTION */}
          <button 
             onClick={() => {/* Trigger AI Contextual helper */}}
             className="h-8 px-4 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-500 hover:text-white transition-all group"
           >
              <Sparkles size={12} className="group-hover:rotate-12 transition-transform" /> AI Magic
           </button>
        </div>
      </BubbleMenu>
      {/* IMAGE BUBBLE MENU */}
      <BubbleMenu
        editor={editor}
        shouldShow={({ editor }) => editor.isActive('image')}
      >
        <div className="flex items-center gap-0.5 p-0.5 bg-theme-surface/80 backdrop-blur-xl border border-white/20 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.12)] animate-in slide-in-from-bottom-2 duration-300">
           <button 
             onClick={() => (window as any).tiptapToggleCrop?.()}
             className="h-8 px-3 rounded-full bg-white/10 text-theme-fg flex items-center gap-2 text-[9px] font-black uppercase tracking-wider hover:bg-emerald-500 hover:text-white transition-all group"
           >
              <Layout size={12} /> Crop
           </button>
           <div className="w-px h-3 bg-white/10 mx-1" />
            <button 
             onClick={() => editor.chain().focus().updateAttributes('image', { float: 'none' }).run()}
             className={cn("h-8 px-3 rounded-full text-[9px] font-black uppercase tracking-wider transition-all", editor.getAttributes('image').float === 'none' ? "bg-emerald-500 text-white" : "text-theme-fg hover:bg-white/10")}
           >
              Block
           </button>
           <button 
             onClick={() => editor.chain().focus().updateAttributes('image', { float: 'left' }).run()}
             className={cn("h-8 px-3 rounded-full text-[9px] font-black uppercase tracking-wider transition-all", editor.getAttributes('image').float === 'left' ? "bg-emerald-500 text-white" : "text-theme-fg hover:bg-white/10")}
           >
              Left
           </button>
           <button 
             onClick={() => editor.chain().focus().updateAttributes('image', { float: 'right' }).run()}
             className={cn("h-8 px-3 rounded-full text-[9px] font-black uppercase tracking-wider transition-all", editor.getAttributes('image').float === 'right' ? "bg-emerald-500 text-white" : "text-theme-fg hover:bg-white/10")}
           >
              Right
           </button>
           <div className="w-px h-3 bg-white/10 mx-1" />
           <button 
             onClick={() => editor.chain().focus().deleteSelection().run()}
             className="h-8 px-3 rounded-full bg-rose-500/10 text-rose-500 flex items-center gap-2 text-[9px] font-black uppercase tracking-wider hover:bg-rose-500 hover:text-white transition-all group shadow-sm"
           >
              <Trash2 size={12} /> Remove
           </button>
        </div>
      </BubbleMenu>

      <div className={cn("relative group editor-container", showBorders ? "show-table-borders" : "hide-table-borders")}>
        <EditorContent editor={editor} className="min-h-[700px] cursor-text caret-black" />
        
        <style>{`
          .ProseMirror, .ProseMirror * {
            caret-color: #000000 !important; /* Pure Black for maximum visibility */
          }
          .cursor-text {
            cursor: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='M16 4v24M10 4h12M10 28h12' stroke='black' stroke-width='2.5' fill='none'/></svg>") 16 16, text !important;
          }
          @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400..700&family=Fira+Code:wght@300..700&family=Inter:wght@100..900&family=Montserrat:wght@100..900&family=Outfit:wght@100..900&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Roboto:wght@100..900&family=Open+Sans:wght@300..800&family=Poppins:wght@100..900&family=Lato:wght@100..900&family=Merriweather:wght@300..900&family=Lora:wght@400..700&family=Libre+Baskerville:wght@400;700&family=Source+Code+Pro:wght@200..900&family=JetBrains+Mono:wght@100..800&family=Pacifico&family=Righteous&display=swap');

          .image-node-container.float-left {
            margin-right: 0.75rem !important;
            margin-bottom: 0.25rem !important;
          }
          .image-node-container.float-right {
            margin-left: 0.75rem !important;
            margin-bottom: 0.25rem !important;
          }
          .image-node-container img {
            max-width: 100%;
            height: auto;
          }
          .show-table-borders .prose table {
            border-collapse: collapse !important;
            width: 100% !important;
            border: 2px solid #000000 !important;
            margin: 2rem 0 !important;
          }
          .show-table-borders .prose td, .show-table-borders .prose th {
            border: 2px solid #000000 !important;
            padding: 12px !important;
            min-width: 50px !important;
          }
          .show-table-borders .prose th {
            background-color: #f8fafc !important;
            color: #000000 !important;
            font-weight: bold !important;
          }
          .hide-table-borders .prose table, 
          .hide-table-borders .prose td, 
          .hide-table-borders .prose th {
            border: 1px solid #e2e8f0 !important;
          }
        `}</style>
        
        {/* CHARACTER COUNT FLOATER */}
        <div className="fixed bottom-12 right-12 flex flex-col items-end gap-2 z-40 pointer-events-none">
           <div className="px-4 py-2 bg-theme-surface/80 backdrop-blur-md border border-theme-border rounded-2xl shadow-xl flex items-center gap-4 animate-in slide-in-from-right-4">
              <div className="flex flex-col">
                <span className="text-[14px] font-black text-theme-fg leading-none">{editor.storage.characterCount.words()}</span>
                <span className="text-[8px] font-black text-theme-muted uppercase tracking-widest">Words</span>
              </div>
              <div className="h-6 w-px bg-theme-border" />
              <div className="flex flex-col">
                <span className="text-[14px] font-black text-theme-fg leading-none">{editor.storage.characterCount.characters()}</span>
                <span className="text-[8px] font-black text-theme-muted uppercase tracking-widest">Chars</span>
              </div>
           </div>
        </div>
      </div>

      <style jsx global>{`
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: var(--theme-muted);
          pointer-events: none;
          height: 0;
          font-weight: 700;
          font-style: italic;
          opacity: 0.5;
        }
        
        .prose table {
          border-collapse: collapse;
          table-layout: fixed;
          width: 100%;
          margin: 0;
          overflow: hidden;
          border-radius: 1rem;
          border: 1px solid var(--theme-border);
        }
        
        .prose table td, .prose table th {
          min-width: 1em;
          border: 1px solid var(--theme-border);
          padding: 12px 16px;
          vertical-align: top;
          box-sizing: border-box;
          position: relative;
        }

        .prose table th {
          font-weight: 900;
          text-align: left;
          background: var(--theme-raised);
          text-transform: uppercase;
          font-size: 0.75rem;
          letter-spacing: 0.05em;
        }

        .prose table .selectedCell:after {
          z-index: 2;
          position: absolute;
          content: "";
          left: 0; right: 0; top: 0; bottom: 0;
          background: rgba(16, 185, 129, 0.08);
          pointer-events: none;
        }

        .prose table .column-resize-handle {
          position: absolute;
          right: -2px;
          top: 0;
          bottom: -2px;
          width: 4px;
          background-color: #10b981;
          pointer-events: none;
        }

        .prose blockquote {
          border-left: 6px solid #10b981;
          background: rgba(16, 185, 129, 0.05);
          padding: 24px;
          border-radius: 0 1.5rem 1.5rem 0;
          font-style: italic;
          font-size: 1.1rem;
          color: var(--theme-fg);
        }

        .prose img {
          transition: all 0.3s ease;
        }
        
        .prose img:hover {
          transform: scale(1.02);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }

        .prose h1 { font-size: 3rem; font-weight: 900; letter-spacing: -0.05em; margin-bottom: 2rem; color: var(--theme-fg); }
        .prose h2 { font-size: 2rem; font-weight: 900; letter-spacing: -0.03em; margin-top: 3rem; margin-bottom: 1.5rem; color: var(--theme-fg); }
        .prose p { line-height: 1.8; font-size: 1.1rem; color: var(--theme-fg); opacity: 0.9; }

        .editor-container {
          animation: fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
