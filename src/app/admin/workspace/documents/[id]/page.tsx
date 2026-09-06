"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/layout/AuthProvider";
import { ShareModal } from "@/components/workspace/ShareModal";
import {
  ArrowLeft, Plus, Trash2, Share2, Save,
  Palette, Sparkles, ChevronDown, Image as LucideImage, PlusSquare,
  DownloadCloud,
  Undo, Redo, Heading1, Heading2, Type, Bold, Italic, Underline as UnderlineIcon,
  AlignLeft, AlignCenter, AlignRight, List, CheckSquare, Quote, Layout, PlusCircle,
  Check, X, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import axios from "axios";
import dayjs from "@/lib/dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AdvancedEditor } from "@/components/workspace/AdvancedEditor";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AISidebar } from "@/components/workspace/AISidebar";

dayjs.extend(relativeTime);

export default function DocumentEditorPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [doc, setDoc] = useState<any>(null);
  const [title, setTitle] = useState("Untitled Document");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [showShare, setShowShare] = useState(false);
  const [collaborators, setCollaborators] = useState<any[]>([]);

  const [pages, setPages] = useState<string[]>([""]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [editors, setEditors] = useState<any[]>([]);
  const [pageSettings, setPageSettings] = useState({ type: 'A4', width: 800, height: 1131 });

  // ── AI Draft blueprint state ─────────────────────────────────
  const [aiDraft, setAiDraft]         = useState<string | null>(null);
  const [aiOriginal, setAiOriginal]   = useState<string | null>(null);
  const [preSaveContent, setPreSaveContent] = useState<string>("");
  const [canReplace, setCanReplace]   = useState(false);
  const [aiLoading, setAiLoading]     = useState(false);

  const [imageUrl, setImageUrl] = useState('');
  const [generatingImage, setGeneratingImage] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [imagePopoverOpen, setImagePopoverOpen] = useState(false);

  const handleImageUpload = (e: any) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event: any) => {
        activeEditor?.chain().focus().setImage({ src: event.target.result }).run();
        setImagePopoverOpen(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUrlSubmit = () => {
    if (imageUrl) {
      activeEditor?.chain().focus().setImage({ src: imageUrl }).run();
      setImageUrl('');
      setImagePopoverOpen(false);
    }
  };

  const generateAIImage = async () => {
    if (!imagePrompt) return;
    setGeneratingImage(true);
    try {
      await axios.post("/api/workspace/ai", {
        action: "custom",
        customPrompt: `Generate a detailed SVG representation or a link to a high-quality image for: ${imagePrompt}.`,
      });
      const keywords = imagePrompt.split(' ').slice(0, 3).join(',');
      const finalUrl = `https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?auto=format&fit=crop&q=80&w=1000&q=${keywords}`;
      activeEditor?.chain().focus().setImage({ src: finalUrl }).run();
      setImagePrompt('');
      setImagePopoverOpen(false);
    } catch {
      alert("AI Image Engine is currently busy. Please try again in a moment.");
    } finally {
      setGeneratingImage(false);
    }
  };

  const activeEditor = editors[activePageIndex];

  const [hsv, setHsv] = useState({ h: 160, s: 90, v: 70 });

  const hsvToHex = (h: number, s: number, v: number) => {
    s /= 100; v /= 100;
    const i = Math.floor(h / 60);
    const f = h / 60 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let r = 0, g = 0, b = 0;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  };

  const updateColorFromHsv = (newHsv: any) => {
    setHsv(newHsv);
    const hex = hsvToHex(newHsv.h, newHsv.s, newHsv.v);
    changeCover(hex);
  };

  const handleSpectrumMove = (e: React.MouseEvent | React.TouchEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const y = 'touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
    let s = ((x - rect.left) / rect.width) * 100;
    let v = 100 - ((y - rect.top) / rect.height) * 100;
    s = Math.max(0, Math.min(100, s));
    v = Math.max(0, Math.min(100, v));
    updateColorFromHsv({ ...hsv, s, v });
  };

  const handleHueMove = (e: React.MouseEvent | React.TouchEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    let h = ((x - rect.left) / rect.width) * 360;
    h = Math.max(0, Math.min(360, h));
    updateColorFromHsv({ ...hsv, h });
  };

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (user?.id) {
      fetchDoc();
      fetchCollaborators();
    }
  }, [id, user?.id]);

  async function fetchDoc() {
    setLoading(true);
    try {
      const res = await axios.get(`/api/workspace/documents/${id}?userId=${user?.id}`);
      setDoc(res.data.document);
      setTitle(res.data.document.title);
      const rawContent = res.data.document.content || "";
      if (rawContent.includes('<!-- PAGE_BREAK -->')) {
        setPages(rawContent.split('<!-- PAGE_BREAK -->'));
      } else {
        setPages([rawContent]);
      }
    } catch (err: any) {
      if (err.response?.status === 403) {
        alert("ACCESS DENIED: You do not have permission to view this document.");
      }
      router.push("/admin/workspace");
    } finally {
      setLoading(false);
    }
  }

  async function fetchCollaborators() {
    try {
      const res = await axios.get(`/api/workspace/shares?itemId=${id}`);
      const users = res.data.sharedUsers?.map((u: any) => ({
        name: u.name,
        role: u.role,
        avatar: `https://ui-avatars.com/api/?name=${u.name}&background=random&color=fff`
      })) || [];
      setCollaborators(users);
    } catch {}
  }

  const handlePageUpdate = useCallback((newHtml: string, index: number) => {
    const newPages = [...pages];
    newPages[index] = newHtml;
    setPages(newPages);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!user?.id) return;
      setSaving(true);
      try {
        const fullContent = newPages.join('<!-- PAGE_BREAK -->');
        await axios.patch(`/api/workspace/documents/${id}?userId=${user.id}`, {
          content: fullContent,
          last_edited_by: user.id
        });
        setSavedAt(new Date());
      } catch { } finally { setSaving(false); }
    }, 2000);
  }, [id, pages, user?.id]);

  useEffect(() => {
    const saveOnLeave = () => {
      if (pages.some(p => p !== "")) {
        const fullContent = pages.join('<!-- PAGE_BREAK -->');
        if (user?.id) {
          axios.patch(`/api/workspace/documents/${id}?userId=${user.id}`, {
            content: fullContent,
            last_edited_by: user.id
          }).catch(() => {});
        }
      }
    };

    window.addEventListener('beforeunload', saveOnLeave);
    return () => {
      window.removeEventListener('beforeunload', saveOnLeave);
      saveOnLeave();
    };
  }, [id, pages, user?.id]);

  const forceSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const fullContent = pages.join('<!-- PAGE_BREAK -->');
      await axios.patch(`/api/workspace/documents/${id}?userId=${user.id}`, {
        content: fullContent,
        last_edited_by: user.id
      });
      setSavedAt(new Date());
      // Clear draft history on explicit save
      localStorage.removeItem(`nexawork_doc_ai_${id}`);
      setAiDraft(null);
      setAiOriginal(null);
      setCanReplace(false);
    } catch { } finally { setSaving(false); }
  };

  const addPage = () => {
    setPages([...pages, ""]);
    setTimeout(() => {
      const main = document.getElementById('document-scroll-container');
      if (main) main.scrollTo({ top: main.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  const removePage = (index: number) => {
    if (pages.length <= 1) return;
    const newPages = pages.filter((_, i) => i !== index);
    setPages(newPages);
    const newEditors = editors.filter((_, i) => i !== index);
    setEditors(newEditors);
    if (activePageIndex >= newPages.length) setActivePageIndex(newPages.length - 1);
  };

  const handleEditorReady = useCallback((ed: any, index: number) => {
    setEditors(prev => {
      if (prev[index] === ed) return prev;
      const next = [...prev];
      next[index] = ed;
      return next;
    });
  }, []);

  // ── AI Draft: restore from localStorage on mount, clear on leave ──
  useEffect(() => {
    if (!id) return;
    const lsKey = `nexawork_doc_ai_${id}`;
    const saved = localStorage.getItem(lsKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.draft) setAiDraft(parsed.draft);
        if (parsed.original) setAiOriginal(parsed.original);
        if (parsed.preSave) setPreSaveContent(parsed.preSave);
        if (parsed.canReplace) setCanReplace(parsed.canReplace);
      } catch {}
    }
    return () => { localStorage.removeItem(lsKey); };
  }, [id]);

  // ── Called by AISidebar when AI returns a result ──
  const handleAIDraft = useCallback((draft: string) => {
    const currentContent = editors[activePageIndex]?.getHTML?.() ?? pages[activePageIndex] ?? "";
    setPreSaveContent(currentContent);
    setAiDraft(draft);
    setCanReplace(false);
    localStorage.setItem(`nexawork_doc_ai_${id}`, JSON.stringify({
      draft, original: null, preSave: currentContent, canReplace: false,
    }));
  }, [editors, activePageIndex, pages, id]);

  const handleAIInsert = useCallback(() => {
    if (!aiDraft) return;
    const editor = editors[activePageIndex];
    if (editor) editor.chain().focus().insertContent(aiDraft).run();
    setAiOriginal(aiDraft);
    setAiDraft(null);
    setCanReplace(true);
    localStorage.setItem(`nexawork_doc_ai_${id}`, JSON.stringify({
      draft: null, original: aiDraft, preSave: preSaveContent, canReplace: true,
    }));
  }, [aiDraft, editors, activePageIndex, preSaveContent, id]);

  const handleAIDiscard = useCallback(() => {
    setAiDraft(null);
    localStorage.removeItem(`nexawork_doc_ai_${id}`);
  }, [id]);

  const handleAIReplace = useCallback(() => {
    if (!aiOriginal) return;
    const editor = editors[activePageIndex];
    if (editor) {
      editor.commands.setContent(aiOriginal);
      handlePageUpdate(aiOriginal, activePageIndex);
    }
    setCanReplace(false);
    localStorage.setItem(`nexawork_doc_ai_${id}`, JSON.stringify({
      draft: null, original: aiOriginal, preSave: preSaveContent, canReplace: false,
    }));
  }, [aiOriginal, editors, activePageIndex, preSaveContent, handlePageUpdate, id]);

  const handleAIDismiss = useCallback(() => {
    setAiOriginal(null);
    setCanReplace(false);
    localStorage.removeItem(`nexawork_doc_ai_${id}`);
  }, [id]);

  const saveTitle = async (val: string) => {
    setTitle(val);
    if (user?.id) {
      await axios.patch(`/api/workspace/documents/${id}?userId=${user.id}`, { title: val });
    }
  };

  const changeCover = async (color: string) => {
    setDoc((prev: any) => ({ ...prev, cover_color: color }));
    if (user?.id) {
      await axios.patch(`/api/workspace/documents/${id}?userId=${user.id}`, { cover_color: color });
    }
  };

  const ToolButton = ({ onClick, active, children, title }: any) => (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon"
      className="h-8 w-8"
      onClick={(e) => { e.preventDefault(); onClick(); }}
      title={title}
    >
      {children}
    </Button>
  );

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 w-72">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[420px] w-full" />
        <Skeleton className="h-6 w-2/3" />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* HEADER */}
      <header
        className="h-16 relative flex-shrink-0 shadow-sm z-[100] border-b border-border"
        style={{ background: doc?.cover_color || "var(--primary)" }}
      >
        {doc?.cover_image && (
          <img src={doc.cover_image} className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-overlay pointer-events-none" alt="" />
        )}
        <div className="absolute inset-0 flex items-center justify-between px-4 sm:px-6 z-50">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/admin/workspace"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-black/10 hover:bg-black/20 text-white transition-colors"
            >
              <ArrowLeft size={16} />
            </Link>
            <div className="h-8 w-8 rounded-md bg-white/20 backdrop-blur-md flex items-center justify-center text-base border border-white/15">
              {doc?.icon || "📄"}
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <Input
                  value={title}
                  onChange={(e) => saveTitle(e.target.value)}
                  className="h-8 w-48 bg-transparent border-0 px-0 text-white font-semibold text-sm focus-visible:ring-0 placeholder:text-white/40"
                  placeholder="Untitled"
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 bg-white/10 hover:bg-white/20 text-white"
                    >
                      <Palette size={13} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-foreground">Cover Color</h3>
                    </div>
                    <div
                      className="w-full h-32 rounded-md relative cursor-crosshair border border-border"
                      onMouseDown={handleSpectrumMove}
                      style={{ background: `linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, transparent), hsl(${hsv.h}, 100%, 50%)` }}
                    >
                      <div
                        className="absolute h-4 w-4 rounded-full border-2 border-white shadow-md"
                        style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, transform: 'translate(-50%, -50%)' }}
                      />
                    </div>
                    <div
                      className="h-2.5 w-full rounded-full bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 via-blue-500 via-purple-500 to-red-500 cursor-pointer relative"
                      onMouseDown={handleHueMove}
                    >
                      <div
                        className="absolute top-1/2 h-4 w-4 rounded-full bg-white shadow-md"
                        style={{ left: `${(hsv.h / 360) * 100}%`, transform: 'translate(-50%, -50%)' }}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 flex items-center justify-between gap-2 px-3 h-9 rounded-md border border-border bg-muted/40">
                        <span className="text-[10px] font-semibold text-muted-foreground">HEX</span>
                        <span className="text-xs font-mono text-foreground">{hsvToHex(hsv.h, hsv.s, hsv.v)}</span>
                      </div>
                      <div
                        className="h-9 w-9 rounded-md border border-border"
                        style={{ background: hsvToHex(hsv.h, hsv.s, hsv.v) }}
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="text-xs text-white/70">
                {saving ? "Syncing…" : `Saved ${dayjs(savedAt || doc?.last_edited_at).fromNow()}`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={forceSave}
              variant="ghost"
              size="sm"
              className="h-8 bg-white/10 hover:bg-white/20 text-white"
            >
              <Save size={12} className={cn("mr-1.5", saving && "animate-pulse")} />
              {saving ? "Saving..." : "Save"}
            </Button>

            <div className="hidden sm:flex -space-x-2 mr-1">
              {collaborators.map((c, i) => (
                <div
                  key={i}
                  className="h-7 w-7 rounded-full border border-white/30 bg-white/10 flex items-center justify-center overflow-hidden"
                  title={`${c.name} (${c.role})`}
                >
                  <img src={c.avatar} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>

            <Button
              type="button"
              onClick={() => setShowShare(true)}
              size="sm"
              className="h-8 bg-white/20 text-white hover:bg-white/30"
            >
              <Share2 size={12} className="mr-1.5" /> Share
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 bg-white/15 hover:bg-white/25 text-white"
            >
              <DownloadCloud size={14} />
            </Button>
          </div>
        </div>
      </header>

      {/* RIBBON */}
      <div className="h-12 bg-card border-b border-border flex items-center px-4 sm:px-6 gap-1 z-[90] overflow-x-auto">
        <ToolButton onClick={() => activeEditor?.chain().focus().undo().run()} active={false} title="Undo"><Undo size={14} /></ToolButton>
        <ToolButton onClick={() => activeEditor?.chain().focus().redo().run()} active={false} title="Redo"><Redo size={14} /></ToolButton>
        <Separator orientation="vertical" className="mx-1 h-6" />
        <ToolButton onClick={() => activeEditor?.chain().focus().toggleHeading({ level: 1 }).run()} active={activeEditor?.isActive('heading', { level: 1 })} title="Heading 1"><Heading1 size={14} /></ToolButton>
        <ToolButton onClick={() => activeEditor?.chain().focus().toggleHeading({ level: 2 }).run()} active={activeEditor?.isActive('heading', { level: 2 })} title="Heading 2"><Heading2 size={14} /></ToolButton>
        <ToolButton onClick={() => activeEditor?.chain().focus().setParagraph().run()} active={activeEditor?.isActive('paragraph')} title="Paragraph"><Type size={14} /></ToolButton>
        <Separator orientation="vertical" className="mx-1 h-6" />
        <ToolButton onClick={() => activeEditor?.chain().focus().toggleBold().run()} active={activeEditor?.isActive('bold')} title="Bold"><Bold size={14} /></ToolButton>
        <ToolButton onClick={() => activeEditor?.chain().focus().toggleItalic().run()} active={activeEditor?.isActive('italic')} title="Italic"><Italic size={14} /></ToolButton>
        <ToolButton onClick={() => activeEditor?.chain().focus().toggleUnderline().run()} active={activeEditor?.isActive('underline')} title="Underline"><UnderlineIcon size={14} /></ToolButton>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Select
          value={activeEditor?.getAttributes('textStyle').fontFamily || "default"}
          onValueChange={(v) => {
            const family = v === "default" ? "" : v;
            activeEditor?.chain().focus().setMark('textStyle', { fontFamily: family }).run();
          }}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Default Font" /></SelectTrigger>
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
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Serif</SelectLabel>
              <SelectItem value="'Playfair Display', serif">Playfair Display</SelectItem>
              <SelectItem value="'Merriweather', serif">Merriweather</SelectItem>
              <SelectItem value="'Lora', serif">Lora</SelectItem>
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Monospace</SelectLabel>
              <SelectItem value="'Fira Code', monospace">Fira Code</SelectItem>
              <SelectItem value="'JetBrains Mono', monospace">JetBrains</SelectItem>
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Creative</SelectLabel>
              <SelectItem value="'Dancing Script', cursive">Handwriting</SelectItem>
              <SelectItem value="'Pacifico', cursive">Pacifico</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select
          value={activeEditor?.getAttributes('textStyle').fontSize || "default"}
          onValueChange={(v) => {
            const size = v === "default" ? "" : v;
            activeEditor?.chain().focus().setMark('textStyle', { fontSize: size }).run();
          }}
        >
          <SelectTrigger className="h-8 w-[88px] text-xs"><SelectValue placeholder="Size" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default</SelectItem>
            {[12, 14, 16, 18, 20, 24, 32, 40, 48, 64].map(size => (
              <SelectItem key={size} value={`${size}px`}>{size}px</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="mx-1 h-6" />
        <ToolButton onClick={() => activeEditor?.chain().focus().setTextAlign('left').run()} active={activeEditor?.isActive({ textAlign: 'left' })} title="Align left"><AlignLeft size={14} /></ToolButton>
        <ToolButton onClick={() => activeEditor?.chain().focus().setTextAlign('center').run()} active={activeEditor?.isActive({ textAlign: 'center' })} title="Align center"><AlignCenter size={14} /></ToolButton>
        <ToolButton onClick={() => activeEditor?.chain().focus().setTextAlign('right').run()} active={activeEditor?.isActive({ textAlign: 'right' })} title="Align right"><AlignRight size={14} /></ToolButton>
        <Separator orientation="vertical" className="mx-1 h-6" />
        <ToolButton onClick={() => activeEditor?.chain().focus().toggleBulletList().run()} active={activeEditor?.isActive('bulletList')} title="Bullet list"><List size={14} /></ToolButton>
        <ToolButton onClick={() => activeEditor?.chain().focus().toggleTaskList().run()} active={activeEditor?.isActive('taskList')} title="Task list"><CheckSquare size={14} /></ToolButton>
        <ToolButton onClick={() => activeEditor?.chain().focus().toggleBlockquote().run()} active={activeEditor?.isActive('blockquote')} title="Blockquote"><Quote size={14} /></ToolButton>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Popover open={imagePopoverOpen} onOpenChange={setImagePopoverOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant={imagePopoverOpen ? "secondary" : "ghost"} size="icon" className="h-8 w-8" title="Insert image">
              <LucideImage size={14} />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-4 space-y-4">
            <p className="text-xs font-semibold text-foreground">Insert Image</p>

            <Button
              type="button"
              variant="outline"
              className="w-full justify-start h-auto py-3"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = handleImageUpload;
                input.click();
              }}
            >
              <PlusSquare size={16} className="mr-3 text-primary" />
              <div className="text-left">
                <p className="text-sm font-medium leading-tight">From Device</p>
                <p className="text-[11px] text-muted-foreground">Upload from folder</p>
              </div>
            </Button>

            <div className="flex items-center gap-2">
              <Input
                type="text"
                placeholder="Paste image URL..."
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="flex-1"
              />
              <Button type="button" size="sm" onClick={handleUrlSubmit}>
                Add
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <Sparkles size={12} /> AI Creative Studio
              </p>
              <Textarea
                placeholder="Describe the image you want to create..."
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                rows={2}
                className="resize-none"
              />
              <Button
                type="button"
                onClick={generateAIImage}
                disabled={generatingImage || !imagePrompt}
                size="sm"
                className="w-full"
              >
                {generatingImage ? "Creating..." : <><Sparkles size={12} className="mr-1.5" /> Generate</>}
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <div className="ml-auto pl-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-8">
                <Layout size={12} className="mr-1.5" /> Layout: {pageSettings.type} <ChevronDown size={10} className="ml-1.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Page Configuration</p>
              {[
                { label: 'A4 Portrait', width: 800, height: 1131, type: 'A4' },
                { label: 'Letter', width: 816, height: 1056, type: 'Letter' },
                { label: 'Presentation', width: 1080, height: 608, type: '16:9' }
              ].map(p => (
                <Button
                  key={p.label}
                  type="button"
                  variant={pageSettings.type === p.type ? "secondary" : "ghost"}
                  className="w-full justify-between h-8"
                  onClick={() => setPageSettings(p)}
                >
                  {p.label}
                  {pageSettings.type === p.type && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </Button>
              ))}
              <Separator />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase">Custom Dimensions (PX)</p>
              <div className="flex items-center gap-2">
                <Input
                  value={pageSettings.width}
                  onChange={(e) => setPageSettings({ ...pageSettings, width: parseInt(e.target.value) || 0, type: 'Custom' })}
                  placeholder="Width"
                  className="h-8 text-xs"
                />
                <span className="text-muted-foreground text-xs">×</span>
                <Input
                  value={pageSettings.height}
                  onChange={(e) => setPageSettings({ ...pageSettings, height: parseInt(e.target.value) || 0, type: 'Custom' })}
                  placeholder="Height"
                  className="h-8 text-xs"
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* MAIN */}
      <div className="flex-1 flex overflow-hidden z-10 min-w-0">
        <main id="document-scroll-container" className="flex-1 overflow-y-auto px-6 sm:px-12 pb-24 pt-12 bg-muted/30 min-w-0">
          <div className="mx-auto flex flex-col items-center gap-12 max-w-full">
            {pages.map((pageContent, idx) => (
              <div key={idx} className="flex flex-col items-center gap-6 w-full">
                <div
                  data-page-wrapper="true"
                  className="bg-card rounded-md shadow-lg ring-1 ring-border relative"
                  style={{ width: `${pageSettings.width}px`, maxWidth: '100%', minHeight: `${pageSettings.height}px` }}
                  onFocus={() => setActivePageIndex(idx)}
                >
                  <div className="p-12 md:p-16 lg:p-[80px] h-full w-full">
                    <AdvancedEditor
                      content={pageContent}
                      onChange={(html) => handlePageUpdate(html, idx)}
                      hideToolbar={true}
                      onEditorReady={(ed) => handleEditorReady(ed, idx)}
                      className="editor-paged w-full h-full"
                    />
                  </div>

                  {/* ── AI Loading Blueprint Overlay ── */}
                  {aiLoading && idx === activePageIndex && (
                    <div
                      className="absolute inset-0 rounded-md pointer-events-none z-10 overflow-hidden"
                      style={{ background: "rgba(235,245,255,0.92)" }}
                    >
                      {/* Animated scan line */}
                      <div className="absolute inset-x-0 h-0.5 bg-blue-400/50 z-20"
                        style={{ animation: "ai-blueprint-scan 2s linear infinite", top: 0 }}
                      />
                      <div className="absolute inset-0 p-12 md:p-16 lg:p-[80px]">
                        {/* Header row */}
                        <div className="flex items-center gap-2.5 mb-8">
                          <div className="h-5 w-5 rounded-full border-2 border-blue-400/30 border-t-blue-500 animate-spin flex-shrink-0" />
                          <span style={{ color: "#1a56c4", fontSize: "0.8rem", fontWeight: 600, opacity: 0.75 }}>
                            AI is writing your document…
                          </span>
                        </div>
                        {/* Shimmer skeleton — title */}
                        <div className="rounded-md bg-blue-400/25 mb-5 animate-pulse" style={{ height: "20px", width: "60%" }} />
                        {/* Shimmer skeleton — paragraph 1 */}
                        {[100, 92, 97, 78, 88, 95, 65].map((w, i) => (
                          <div key={i} className="rounded-full bg-blue-400/18 mb-2.5 animate-pulse"
                            style={{ height: "11px", width: `${w}%`, animationDelay: `${i * 0.09}s`, opacity: 0.7 }}
                          />
                        ))}
                        {/* Gap */}
                        <div className="mt-6" />
                        {/* Shimmer skeleton — paragraph 2 */}
                        <div className="rounded-md bg-blue-400/20 mb-4 animate-pulse" style={{ height: "15px", width: "45%", animationDelay: "0.7s" }} />
                        {[88, 95, 70, 82, 90, 60].map((w, i) => (
                          <div key={`b${i}`} className="rounded-full bg-blue-400/15 mb-2.5 animate-pulse"
                            style={{ height: "11px", width: `${w}%`, animationDelay: `${(i + 8) * 0.09}s`, opacity: 0.6 }}
                          />
                        ))}
                        {/* Gap */}
                        <div className="mt-6" />
                        {/* Shimmer skeleton — paragraph 3 */}
                        <div className="rounded-md bg-blue-400/18 mb-4 animate-pulse" style={{ height: "15px", width: "50%", animationDelay: "1.4s" }} />
                        {[75, 90, 83, 68].map((w, i) => (
                          <div key={`c${i}`} className="rounded-full bg-blue-400/12 mb-2.5 animate-pulse"
                            style={{ height: "11px", width: `${w}%`, animationDelay: `${(i + 15) * 0.09}s`, opacity: 0.5 }}
                          />
                        ))}
                        {/* Bottom fade */}
                        <div className="absolute bottom-0 inset-x-0 h-32 pointer-events-none"
                          style={{ background: "linear-gradient(to bottom, transparent, rgba(235,245,255,0.97))" }}
                        />
                      </div>
                    </div>
                  )}

                  {/* ── AI Draft Blueprint Ghost Overlay ── */}
                  {aiDraft && idx === activePageIndex && (
                    <div
                      className="absolute inset-0 rounded-md pointer-events-none z-10 overflow-hidden"
                      style={{ background: "rgba(235,245,255,0.90)" }}
                    >
                      {/* Animated scan line */}
                      <div className="absolute inset-x-0 h-0.5 bg-blue-400/40 z-20"
                        style={{ animation: "ai-blueprint-scan 2.5s linear infinite", top: 0 }}
                      />
                      <div className="absolute inset-0 p-12 md:p-16 lg:p-[80px] overflow-hidden">
                        <div
                          className="prose prose-sm max-w-none"
                          style={{ color: "#1a56c4", opacity: 0.82, lineHeight: 1.75 }}
                          dangerouslySetInnerHTML={{ __html: aiDraft }}
                        />
                        {/* Fade-out at bottom so users know there's more on Insert */}
                        <div className="absolute bottom-0 inset-x-0 h-28 pointer-events-none"
                          style={{ background: "linear-gradient(to bottom, transparent, rgba(235,245,255,0.97))" }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 w-full max-w-md">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={addPage}
                  >
                    <PlusCircle size={14} className="mr-2 text-primary" />
                    Add New Page
                  </Button>
                  {pages.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      title="Remove page"
                      onClick={() => removePage(idx)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* ── Floating AI Action Bar ── */}
          {(aiDraft || (canReplace && aiOriginal)) && (
            <div
              className="sticky bottom-6 left-0 right-0 flex justify-center z-30 pointer-events-none"
            >
              <div
                className="pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-full shadow-2xl"
                style={{
                  background: "rgba(255,255,255,0.88)",
                  backdropFilter: "blur(18px)",
                  WebkitBackdropFilter: "blur(18px)",
                  border: "1px solid rgba(99,102,241,0.18)",
                  boxShadow: "0 8px 32px rgba(21,101,192,0.16), 0 2px 8px rgba(0,0,0,0.08)",
                }}
              >
                {/* Status indicator */}
                <div className="flex items-center gap-1.5 pr-3 border-r border-slate-200 mr-1">
                  <div className={`h-2 w-2 rounded-full ${aiDraft ? "bg-blue-500 animate-pulse" : "bg-emerald-500"}`} />
                  <span className="text-xs font-semibold text-slate-600">
                    {aiDraft ? "AI Draft Preview" : "AI Draft Inserted"}
                  </span>
                </div>

                {aiDraft ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5 rounded-full text-xs px-4"
                      onClick={handleAIInsert}
                    >
                      <Check size={13} /> Insert
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 rounded-full text-xs px-3"
                      onClick={handleAIDiscard}
                    >
                      <X size={13} /> Discard
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 rounded-full text-xs px-3 opacity-40 cursor-not-allowed"
                      disabled
                      title="Insert first, then Replace becomes available"
                    >
                      <RefreshCw size={13} /> Replace
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5 rounded-full text-xs px-3"
                      onClick={() => editors[activePageIndex]?.chain().focus().undo().run()}
                      title="Undo"
                    >
                      <Undo size={13} />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5 rounded-full text-xs px-3"
                      onClick={() => editors[activePageIndex]?.chain().focus().redo().run()}
                      title="Redo"
                    >
                      <Redo size={13} />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5 rounded-full text-xs px-4"
                      onClick={handleAIReplace}
                      title="Replace current document content with original AI draft"
                    >
                      <RefreshCw size={13} /> Replace
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 rounded-full text-muted-foreground"
                      onClick={handleAIDismiss}
                      title="Dismiss"
                    >
                      <X size={13} />
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </main>
        <aside className="hidden lg:block w-80 flex-shrink-0 border-l border-border bg-card">
          <AISidebar
            content={pages.join('\n')}
            onAIDraft={handleAIDraft}
            onLoadingChange={setAiLoading}
            onRenameDocument={(newTitle) => saveTitle(newTitle)}
          />
        </aside>
      </div>

      <style jsx global>{`
        .editor-paged .ProseMirror { min-height: 100% !important; padding-bottom: 0 !important; }
        .editor-paged .prose p { font-size: 1rem; line-height: 1.6; }
        @keyframes ai-blueprint-scan {
          0%   { top: 0%;   opacity: 0.6; }
          50%  { opacity: 0.3; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>

      <footer className="h-9 bg-card border-t border-border flex items-center justify-between px-6 z-50 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span>Realtime Sync: Connected</span>
          </div>
          <span>Owner: {user?.name || "NexaWork Admin"}</span>
        </div>
      </footer>

      {showShare && doc && user?.id && (
        <ShareModal
          itemId={doc.id}
          itemType="document"
          itemTitle={doc.title || title}
          currentUserId={user.id}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
