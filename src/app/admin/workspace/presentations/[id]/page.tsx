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
import {
  ArrowLeft, Plus, Trash2, Share2, Type, Image as ImageIcon, Square,
  ChevronLeft, ChevronRight, Play, Copy,
  Sparkles, Download, MoreVertical, Layout, MousePointer2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import axios from "axios";
import dayjs from "@/lib/dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

dayjs.extend(relativeTime);

interface SlideElement {
  id: string;
  type: "text" | "shape" | "image";
  content: string;
  x: number; y: number; width: number; height: number;
  style: Record<string, string>;
}

interface Slide {
  id: string;
  background: string;
  layout: "title" | "content" | "two-col" | "blank";
  elements: SlideElement[];
}

interface PptDoc {
  id: string; title: string; icon: string;
  slides: Slide[]; is_pinned: boolean; last_edited_at: string;
  owner?: { name: string };
}

const BG_SWATCHES = [
  "#FFFFFF", "#F8FAFC", "#EFF6FF", "#F0FDF4", "#FAF5FF",
  "#FFF7ED", "#0F172A", "#1E293B", "#18181B", "#111827",
];

const LAYOUTS: { id: Slide["layout"]; label: string; desc: string }[] = [
  { id: "title",   label: "Title Slide",  desc: "Hero title + subtitle" },
  { id: "content", label: "Standard",     desc: "Title + bullet points" },
  { id: "two-col", label: "Two Column",   desc: "Side-by-side columns"  },
  { id: "blank",   label: "Blank",        desc: "Empty canvas"          },
];

function makeSlide(layout: Slide["layout"] = "title"): Slide {
  const id = `slide-${Date.now()}`;
  const elBase = (eid: string): SlideElement => ({
    id: eid, type: "text", content: "", x: 10, y: 30, width: 80, height: 14,
    style: { fontSize: "1.6rem", fontWeight: "bold", color: "#1e293b", textAlign: "center" },
  });

  if (layout === "title") {
    return {
      id, background: "#FFFFFF", layout,
      elements: [
        { ...elBase("el-t"), content: "Click to edit title", x: 10, y: 28, width: 80, height: 16,
          style: { fontSize: "2.2rem", fontWeight: "800", color: "#0f172a", textAlign: "center" } },
        { ...elBase("el-s"), content: "Add your subtitle here", x: 15, y: 52, width: 70, height: 10,
          style: { fontSize: "1.1rem", fontWeight: "400", color: "#64748b", textAlign: "center" } },
      ],
    };
  }
  if (layout === "content") {
    return {
      id, background: "#FFFFFF", layout,
      elements: [
        { ...elBase("el-h"), content: "Slide Title", x: 5, y: 8, width: 90, height: 12,
          style: { fontSize: "1.8rem", fontWeight: "700", color: "#0f172a", textAlign: "left" } },
        { ...elBase("el-b"), content: "• Point one\n• Point two\n• Point three", x: 5, y: 26, width: 90, height: 60,
          style: { fontSize: "1rem", fontWeight: "400", color: "#334155", textAlign: "left", whiteSpace: "pre-wrap" } },
      ],
    };
  }
  if (layout === "two-col") {
    return {
      id, background: "#FFFFFF", layout,
      elements: [
        { ...elBase("el-h"), content: "Slide Title", x: 5, y: 5, width: 90, height: 12,
          style: { fontSize: "1.8rem", fontWeight: "700", color: "#0f172a", textAlign: "center" } },
        { ...elBase("el-l"), content: "Left column content here", x: 3, y: 22, width: 45, height: 70,
          style: { fontSize: "0.95rem", fontWeight: "400", color: "#334155", textAlign: "left", whiteSpace: "pre-wrap" } },
        { ...elBase("el-r"), content: "Right column content here", x: 52, y: 22, width: 45, height: 70,
          style: { fontSize: "0.95rem", fontWeight: "400", color: "#334155", textAlign: "left", whiteSpace: "pre-wrap" } },
      ],
    };
  }
  return { id, background: "#FFFFFF", layout: "blank", elements: [] };
}

function SlideCanvas({
  slide, selected, editing, onSelect, onEdit, onBlur, onChange,
}: {
  slide: Slide;
  selected: string | null;
  editing: string | null;
  onSelect: (id: string | null) => void;
  onEdit: (id: string) => void;
  onBlur: () => void;
  onChange: (elId: string, content: string) => void;
}) {
  return (
    <div
      className="w-full h-full relative overflow-hidden select-none"
      style={{ background: slide.background }}
      onClick={() => onSelect(null)}
    >
      {slide.elements.map((el) => (
        <div
          key={el.id}
          onClick={(e) => { e.stopPropagation(); onSelect(el.id); }}
          onDoubleClick={(e) => { e.stopPropagation(); onEdit(el.id); }}
          className={cn(
            "absolute transition-colors",
            selected === el.id && editing !== el.id && "ring-2 ring-primary ring-offset-1 cursor-move",
            selected !== el.id && editing !== el.id && "cursor-pointer hover:ring-1 hover:ring-primary/40",
          )}
          style={{
            left: `${el.x}%`, top: `${el.y}%`,
            width: `${el.width}%`, height: `${el.height}%`,
          }}
        >
          {editing === el.id ? (
            <textarea
              autoFocus
              defaultValue={el.content}
              onBlur={(e) => { onChange(el.id, e.target.value); onBlur(); }}
              className="w-full h-full resize-none bg-transparent outline-none border-none p-0"
              style={el.style as React.CSSProperties}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              className="w-full h-full overflow-hidden"
              style={el.style as React.CSSProperties}
            >
              {el.content || <span className="opacity-30">Double-click to edit</span>}
            </div>
          )}
        </div>
      ))}

      {slide.elements.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-muted-foreground font-medium">Blank slide — add elements from the toolbar</p>
        </div>
      )}
    </div>
  );
}

function SlideThumbnail({ slide, index, active, onClick, onDuplicate, onDelete }: {
  slide: Slide; index: number; active: boolean;
  onClick: () => void; onDuplicate: () => void; onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        "relative aspect-video rounded-md border-2 cursor-pointer transition-colors overflow-hidden group",
        active ? "border-primary shadow-sm" : "border-border hover:border-foreground/40",
      )}
    >
      <div className="w-full h-full" style={{ background: slide.background }}>
        <div className="absolute inset-0 scale-[0.18] origin-top-left pointer-events-none" style={{ width: "550%", height: "550%" }}>
          {slide.elements.map((el) => (
            <div key={el.id} className="absolute overflow-hidden" style={{
              left: `${el.x}%`, top: `${el.y}%`, width: `${el.width}%`, height: `${el.height}%`,
              ...(el.style as React.CSSProperties),
            }}>
              {el.content}
            </div>
          ))}
        </div>
      </div>
      <span className="absolute top-1 left-1 text-[8px] font-bold bg-black/30 text-white rounded px-1">
        {index + 1}
      </span>
      {hover && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-6 w-6 bg-white/20 hover:bg-white/40 text-white"
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          >
            <Copy size={10} />
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 size={10} />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function PresentationEditorPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [doc, setDoc] = useState<PptDoc | null>(null);
  const [title, setTitle] = useState("Untitled Presentation");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [selectedEl, setSelectedEl] = useState<string | null>(null);
  const [editEl, setEditEl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [presenting, setPresenting] = useState(false);
  const [presentSlide, setPresentSlide] = useState(0);
  const [rightTab, setRightTab] = useState<"theme" | "layers">("theme");

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { fetchDoc(); }, [id]);

  async function fetchDoc() {
    setLoading(true);
    try {
      const res = await axios.get(`/api/workspace/presentations/${id}?userId=${user?.id || "anon"}`);
      const d = res.data.presentation;
      setDoc(d);
      setTitle(d.title || "Untitled Presentation");
      const s = d.slides && d.slides.length > 0 ? d.slides : [makeSlide("title")];
      setSlides(s);
    } catch {
      router.push("/admin/workspace/presentations");
    } finally {
      setLoading(false);
    }
  }

  const persistSlides = useCallback(async (s: Slide[]) => {
    setSaving(true);
    try {
      await axios.patch(`/api/workspace/presentations/${id}?userId=${user?.id || "anon"}`, {
        slides: s, last_edited_by: user?.id,
      });
      setSavedAt(new Date());
    } catch { } finally { setSaving(false); }
  }, [id, user?.id]);

  function updateSlides(s: Slide[]) {
    setSlides(s);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persistSlides(s), 1500);
  }

  async function saveTitle(val: string) {
    setTitle(val);
    await axios.patch(`/api/workspace/presentations/${id}?userId=${user?.id || "anon"}`, { title: val });
  }

  function addSlide(layout: Slide["layout"] = "blank") {
    const s = [...slides];
    const newSlide = makeSlide(layout);
    s.splice(activeSlide + 1, 0, newSlide);
    updateSlides(s);
    setActiveSlide(activeSlide + 1);
  }

  function duplicateSlide(idx: number) {
    const s = [...slides];
    const dup: Slide = JSON.parse(JSON.stringify(s[idx]));
    dup.id = `slide-${Date.now()}`;
    dup.elements = dup.elements.map(el => ({ ...el, id: `${el.id}-copy` }));
    s.splice(idx + 1, 0, dup);
    updateSlides(s);
    setActiveSlide(idx + 1);
  }

  function deleteSlide(idx: number) {
    if (slides.length <= 1) return;
    const s = slides.filter((_, i) => i !== idx);
    updateSlides(s);
    setActiveSlide(Math.min(idx, s.length - 1));
  }

  function setSlideBackground(color: string) {
    const s = slides.map((sl, i) => i === activeSlide ? { ...sl, background: color } : sl);
    updateSlides(s);
  }

  function addTextElement() {
    const el: SlideElement = {
      id: `el-${Date.now()}`, type: "text",
      content: "New text element",
      x: 20, y: 40, width: 60, height: 12,
      style: { fontSize: "1rem", fontWeight: "400", color: "#0f172a", textAlign: "left" },
    };
    const s = slides.map((sl, i) => i === activeSlide ? { ...sl, elements: [...sl.elements, el] } : sl);
    updateSlides(s);
    setSelectedEl(el.id);
    setTimeout(() => setEditEl(el.id), 50);
  }

  function updateElementContent(elId: string, content: string) {
    const s = slides.map((sl, i) => i === activeSlide
      ? { ...sl, elements: sl.elements.map(el => el.id === elId ? { ...el, content } : el) }
      : sl
    );
    updateSlides(s);
  }

  function deleteSelectedElement() {
    if (!selectedEl) return;
    const s = slides.map((sl, i) => i === activeSlide
      ? { ...sl, elements: sl.elements.filter(el => el.id !== selectedEl) }
      : sl
    );
    updateSlides(s);
    setSelectedEl(null);
  }

  const current = slides[activeSlide];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 w-72">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-[420px] w-full" />
          <Skeleton className="h-6 w-2/3" />
        </div>
      </div>
    );
  }

  if (presenting) {
    const ps = slides[presentSlide];
    return (
      <div className="fixed inset-0 bg-black z-[9999] flex flex-col">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="relative shadow-2xl" style={{ width: "min(90vw, 160vh)", aspectRatio: "16/9" }}>
            <div className="w-full h-full rounded-md overflow-hidden" style={{ background: ps.background }}>
              {ps.elements.map((el) => (
                <div key={el.id} className="absolute overflow-hidden" style={{
                  left: `${el.x}%`, top: `${el.y}%`,
                  width: `${el.width}%`, height: `${el.height}%`,
                  ...(el.style as React.CSSProperties),
                }}>
                  {el.content}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="h-14 flex items-center justify-center gap-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="bg-white/10 hover:bg-white/20 text-white"
            onClick={() => setPresentSlide(p => Math.max(0, p - 1))}
            disabled={presentSlide === 0}
          >
            <ChevronLeft size={18} />
          </Button>
          <span className="text-white/70 text-sm font-medium tabular-nums">
            {presentSlide + 1} / {slides.length}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="bg-white/10 hover:bg-white/20 text-white"
            onClick={() => setPresentSlide(p => Math.min(slides.length - 1, p + 1))}
            disabled={presentSlide === slides.length - 1}
          >
            <ChevronRight size={18} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-4 bg-white/10 hover:bg-destructive/50 text-white"
            onClick={() => { setPresenting(false); setPresentSlide(0); }}
          >
            <X size={18} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">

      {/* HEADER */}
      <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 z-50 flex-shrink-0 gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Link
            href="/admin/workspace/presentations"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <ArrowLeft size={16} />
          </Link>

          <span className="text-lg flex-shrink-0">{doc?.icon ?? "📑"}</span>

          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => saveTitle(e.target.value)}
            className="h-8 bg-transparent border-0 px-0 font-semibold text-sm focus-visible:ring-0 min-w-0 flex-1"
            placeholder="Untitled Presentation"
          />

          <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:block">
            {saving ? "Saving…" : savedAt ? `Saved ${dayjs(savedAt).fromNow()}` : doc?.last_edited_at ? `Saved ${dayjs(doc.last_edited_at).fromNow()}` : ""}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            type="button"
            size="sm"
            onClick={() => { setPresentSlide(0); setPresenting(true); }}
          >
            <Play size={12} fill="currentColor" className="mr-1.5" /> Present
          </Button>
          <Button type="button" variant="ghost" size="icon">
            <Share2 size={15} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon">
                <MoreVertical size={15} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem>
                <Download size={12} className="mr-2 text-muted-foreground" /> Export PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive">
                <Trash2 size={12} className="mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* TOOLBAR */}
      <div className="h-11 bg-card border-b border-border flex items-center gap-1 px-3 flex-shrink-0">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Select" disabled>
          <MousePointer2 size={14} />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Add text" onClick={addTextElement}>
          <Type size={14} />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Shape" disabled>
          <Square size={14} />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Image" disabled>
          <ImageIcon size={14} />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8">
              <Layout size={13} className="mr-1.5" /> Layout
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Insert layout</p>
            <div className="grid grid-cols-2 gap-2">
              {LAYOUTS.map((l) => (
                <Button
                  key={l.id}
                  type="button"
                  variant="outline"
                  className="h-auto flex-col items-start text-left p-2.5"
                  onClick={() => addSlide(l.id)}
                >
                  <p className="text-xs font-semibold">{l.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{l.desc}</p>
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {selectedEl && (
          <>
            <Separator orientation="vertical" className="mx-1 h-6" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={deleteSelectedElement}
            >
              <Trash2 size={13} className="mr-1.5" /> Delete element
            </Button>
          </>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-violet-500 hover:bg-violet-500/10" title="AI Generate">
            <Sparkles size={14} />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden min-w-0">

        {/* SLIDE PANEL */}
        <aside className="w-52 bg-card border-r border-border flex flex-col overflow-hidden flex-shrink-0">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground">
              Slides · {slides.length}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => addSlide("blank")}
              title="Add blank slide"
            >
              <Plus size={13} />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {slides.map((slide, idx) => (
              <SlideThumbnail
                key={slide.id}
                slide={slide}
                index={idx}
                active={activeSlide === idx}
                onClick={() => { setActiveSlide(idx); setSelectedEl(null); setEditEl(null); }}
                onDuplicate={() => duplicateSlide(idx)}
                onDelete={() => deleteSlide(idx)}
              />
            ))}

            <Button
              type="button"
              variant="outline"
              className="w-full aspect-video h-auto border-dashed text-xs"
              onClick={() => addSlide("blank")}
            >
              <Plus size={12} className="mr-1.5" /> New Slide
            </Button>
          </div>

          <div className="border-t border-border p-2 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setActiveSlide(p => Math.max(0, p - 1))}
              disabled={activeSlide === 0}
            >
              <ChevronLeft size={14} />
            </Button>
            <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
              {activeSlide + 1} / {slides.length}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setActiveSlide(p => Math.min(slides.length - 1, p + 1))}
              disabled={activeSlide === slides.length - 1}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </aside>

        {/* CANVAS */}
        <main className="flex-1 bg-muted/30 flex items-center justify-center p-8 overflow-hidden min-w-0">
          {current ? (
            <div
              className="rounded-md shadow-lg ring-1 ring-border overflow-hidden"
              style={{ width: "min(960px, calc(100% - 2rem))", aspectRatio: "16/9" }}
            >
              <SlideCanvas
                slide={current}
                selected={selectedEl}
                editing={editEl}
                onSelect={setSelectedEl}
                onEdit={(id) => { setSelectedEl(id); setEditEl(id); }}
                onBlur={() => setEditEl(null)}
                onChange={updateElementContent}
              />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No slides yet</p>
          )}
        </main>

        {/* RIGHT PANEL */}
        <aside className="w-64 bg-card border-l border-border flex flex-col flex-shrink-0">
          <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as "theme" | "layers")} className="flex flex-col flex-1 overflow-hidden">
            <TabsList className="grid grid-cols-2 mx-3 mt-3 mb-2 h-9">
              <TabsTrigger value="theme" className="text-xs">Theme</TabsTrigger>
              <TabsTrigger value="layers" className="text-xs">Layers</TabsTrigger>
            </TabsList>

            <TabsContent value="theme" className="p-4 space-y-5 overflow-y-auto flex-1 mt-0">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-3">Background</p>
                <div className="grid grid-cols-5 gap-2">
                  {BG_SWATCHES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setSlideBackground(c)}
                      className={cn(
                        "h-9 rounded-md border-2 transition-transform hover:scale-110",
                        current?.background === c ? "border-primary shadow-sm" : "border-border",
                      )}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground font-medium">Custom</span>
                  <input
                    type="color"
                    value={current?.background || "#FFFFFF"}
                    onChange={(e) => setSlideBackground(e.target.value)}
                    className="h-7 w-12 rounded cursor-pointer border border-border bg-transparent"
                  />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-3">Quick layouts</p>
                <div className="space-y-1.5">
                  {LAYOUTS.map((l) => (
                    <Button
                      key={l.id}
                      type="button"
                      variant="outline"
                      className="w-full h-auto flex-col items-start text-left py-2.5"
                      onClick={() => addSlide(l.id)}
                    >
                      <p className="text-xs font-semibold">{l.label}</p>
                      <p className="text-[10px] text-muted-foreground">{l.desc}</p>
                    </Button>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="layers" className="p-4 space-y-2 overflow-y-auto flex-1 mt-0">
              <p className="text-xs font-semibold text-muted-foreground mb-3">
                Elements on slide {activeSlide + 1}
              </p>
              {current?.elements.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No elements. Add text from the toolbar.</p>
              ) : (
                current?.elements.map((el) => (
                  <Button
                    key={el.id}
                    type="button"
                    variant={selectedEl === el.id ? "secondary" : "outline"}
                    className="w-full justify-start gap-2.5"
                    onClick={() => setSelectedEl(el.id)}
                  >
                    <div className={cn("h-2 w-2 rounded-full flex-shrink-0", el.type === "text" ? "bg-blue-400" : "bg-violet-400")} />
                    <span className="text-xs font-medium truncate flex-1 text-left">{el.content || `${el.type} element`}</span>
                  </Button>
                ))
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full border-dashed text-xs mt-2"
                onClick={addTextElement}
              >
                <Plus size={11} className="mr-1.5" /> Add Text
              </Button>
            </TabsContent>
          </Tabs>

          <div className="p-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              className="w-full h-auto flex-col items-start text-left py-3 hover:border-violet-500/40 hover:bg-violet-500/5"
            >
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={13} className="text-violet-500" />
                <span className="text-[10px] font-semibold text-violet-500">AI Content Assist</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">
                Generate slide content, outlines, and talking points instantly.
              </p>
            </Button>
          </div>
        </aside>
      </div>

      {/* FOOTER */}
      <footer className="h-8 bg-card border-t border-border flex items-center justify-between px-4 flex-shrink-0">
        <span className="text-[10px] text-muted-foreground font-medium">
          Slide {activeSlide + 1} of {slides.length} · 16:9 widescreen
        </span>
        <span className="text-[10px] text-muted-foreground">
          {saving ? "Saving…" : savedAt ? `Last saved ${dayjs(savedAt).fromNow()}` : ""}
        </span>
      </footer>
    </div>
  );
}
