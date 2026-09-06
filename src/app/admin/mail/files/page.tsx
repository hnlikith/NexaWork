"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useState, useEffect, useRef } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/layout/AuthProvider";
import { useToast } from "@/components/ui/ToastLegacy";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Paperclip, Upload, Download, Trash2, Search, X, Loader2,
  FileText, Film, Archive, File, Clock, Mail, RefreshCw,
  ExternalLink, RotateCcw, Inbox, ArrowUpDown, CheckCircle2, AlertCircle,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

type Scope   = "all" | "mine" | "shared" | "uploaded" | "trash";
type SortKey  = "date_desc" | "date_asc" | "size_desc" | "size_asc" | "name_asc" | "name_desc";

type UploadState = {
  filename: string;
  fileSize: number;
  fileType: string;
  previewUrl: string | null; // client-side blob preview
  progress: number;          // 0-100
  status: "preparing" | "uploading" | "processing" | "done" | "error";
  errorMsg?: string;
};

type FileShare = {
  id: string; filename: string; file_size: number; file_type: string;
  storage_url: string; shared_by: string; shared_with: string[] | null;
  expiry_at: string | null; download_count: number; is_active: boolean;
  created_at: string;
  source?: "upload" | "email";
  subject?: string;
  from_address?: string;
  external_from?: string;
  folder?: string;
  sharer?: { id: string; name: string; designation: string };
};

// ── Thumbnail components ──────────────────────────────────────────────────────

function ImageThumb({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <FileText size={24} className="text-blue-400 opacity-40" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className="w-full h-full object-contain"
      onError={() => setFailed(true)}
    />
  );
}

function PdfThumb({ url }: { url: string }) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus]     = useState<"idle" | "loading" | "done" | "failed">("idle");
  const renderCalledRef         = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && status === "idle") setStatus("loading"); },
      { rootMargin: "300px" }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [status]);

  useEffect(() => {
    if (status !== "loading" || renderCalledRef.current) return;
    renderCalledRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = (await import("pdfjs-dist")) as any;
        if (!pdfjs.GlobalWorkerOptions.workerSrc)
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const pdf  = await pdfjs.getDocument({ url, withCredentials: true }).promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const containerW = canvas.parentElement?.clientWidth || 200;
        const vp      = page.getViewport({ scale: 1 });
        const scale   = containerW / vp.width;
        const scaled  = page.getViewport({ scale });
        canvas.width  = scaled.width;
        canvas.height = scaled.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport: scaled }).promise;
        if (!cancelled) setStatus("done");
      } catch { if (!cancelled) setStatus("failed"); }
    })();
    return () => { cancelled = true; };
  }, [status, url]);

  return (
    <div ref={containerRef} className="w-full h-full bg-white flex items-start justify-center overflow-hidden">
      {status === "idle"    && <FileText size={24} className="text-rose-400 opacity-30 mt-8" />}
      {status === "loading" && <Loader2  size={16} className="animate-spin text-rose-400 opacity-60 mt-8" />}
      {status === "failed"  && <FileText size={24} className="text-rose-400 opacity-40 mt-8" />}
      <canvas ref={canvasRef} className={cn("w-full", status !== "done" && "hidden")} />
    </div>
  );
}

function FileThumbnail({ f, tall = false }: { f: FileShare; tall?: boolean }) {
  const ft = f.file_type || "";
  const fn = f.filename?.toLowerCase() || "";
  const h  = tall ? "h-48" : "h-32";

  const isImage = ft.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/.test(fn);
  const isPdf   = ft.includes("pdf") || fn.endsWith(".pdf");
  const isVideo = ft.startsWith("video/");
  const isZip   = ft.includes("zip") || ft.includes("rar") || ft.includes("7z") || /\.(zip|rar|7z|tar|gz)$/.test(fn);
  const isWord  = ft.includes("word") || fn.endsWith(".docx") || fn.endsWith(".doc");
  const isSheet = ft.includes("sheet") || ft.includes("excel") || /\.(xlsx|xls|csv)$/.test(fn);
  const bg      = isPdf ? "bg-white" : "bg-muted/40";

  return (
    <div className={cn("w-full rounded-t-xl overflow-hidden", h, bg)}>
      {isImage && <ImageThumb url={f.storage_url} alt={f.filename} />}
      {isPdf   && <PdfThumb url={f.storage_url} />}
      {!isImage && !isPdf && (
        <div className="w-full h-full flex items-center justify-center">
          {isVideo  && <Film    size={tall ? 32 : 24} className="text-purple-400" />}
          {isZip    && <Archive size={tall ? 32 : 24} className="text-amber-400" />}
          {isWord   && <FileText size={tall ? 32 : 24} className="text-blue-500" />}
          {isSheet  && <FileText size={tall ? 32 : 24} className="text-emerald-500" />}
          {!isVideo && !isZip && !isWord && !isSheet && (
            <File size={tall ? 32 : 24} className="text-muted-foreground" />
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────


function friendlyType(fileType: string, filename: string): string {
  const ext = (filename.split(".").pop() || "").toUpperCase();
  if (fileType.includes("pdf"))           return "PDF Document";
  if (fileType.includes("word") || /\.(DOCX?|DOC)$/.test(ext))
                                          return `Word Document (.${ext.toLowerCase()})`;
  if (fileType.includes("sheet") || fileType.includes("excel") || /\.(XLSX?|XLS|CSV)$/.test(ext))
                                          return `Spreadsheet (.${ext.toLowerCase()})`;
  if (fileType.includes("presentation") || /\.(PPTX?|PPT)$/.test(ext))
                                          return `Presentation (.${ext.toLowerCase()})`;
  if (fileType.startsWith("image/"))      return `Image (${fileType.split("/")[1]?.toUpperCase()})`;
  if (fileType.startsWith("video/"))      return `Video (${fileType.split("/")[1]?.toUpperCase()})`;
  if (fileType.startsWith("audio/"))      return `Audio (${fileType.split("/")[1]?.toUpperCase()})`;
  if (fileType.includes("zip") || fileType.includes("rar") || fileType.includes("7z"))
                                          return `Archive (.${ext.toLowerCase()})`;
  if (fileType.startsWith("text/"))       return ext ? `${ext} File` : "Text File";
  if (ext)                                return `${ext} File`;
  return fileType || "Unknown";
}

function formatBytes(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024)    return `${bytes} B`;
  if (bytes < 1024**2) return `${(bytes/1024).toFixed(1)} KB`;
  if (bytes < 1024**3) return `${(bytes/1024**2).toFixed(1)} MB`;
  return `${(bytes/1024**3).toFixed(2)} GB`;
}

const LS_KEY      = "nexus_dismissed_files";
const LS_PERM_KEY = "nexus_perm_deleted_email_ids";

function loadDismissed(): FileShare[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }
  catch { return []; }
}
function saveDismissed(list: FileShare[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

function loadPermDeleted(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(LS_PERM_KEY) || "[]")); }
  catch { return new Set(); }
}
function savePermDeleted(set: Set<string>) {
  localStorage.setItem(LS_PERM_KEY, JSON.stringify([...set]));
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FilesPage() {
  const { user }      = useAuth();
  const { showToast } = useToast();
  const inputRef      = useRef<HTMLInputElement>(null);
  const userEmail     = (user as any)?.email || "";

  const [files,     setFiles]     = useState<FileShare[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search,    setSearch]    = useState("");
  const [scope,     setScope]     = useState<Scope>("all");
  const [acting,       setActing]      = useState<string | null>(null);
  const [preview,      setPreview]     = useState<FileShare | null>(null);
  const [sort,         setSort]        = useState<SortKey>("date_desc");
  const [uploadState,  setUploadState] = useState<UploadState | null>(null);
  const [currentEmployee, setCurrentEmployee] = useState<{ id: string } | null>(null);

  // Dismissed email files — in Trash (localStorage)
  const [dismissedEmailFiles, setDismissedEmailFiles] = useState<FileShare[]>(loadDismissed);
  // Permanently deleted email file IDs — hidden from ALL views including All Files
  const [permDeletedEmailIds, setPermDeletedEmailIds] = useState<Set<string>>(loadPermDeleted);
  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const dismissedIds = new Set(dismissedEmailFiles.map(f => f.id));

  useEffect(() => {
    supabase.from("employees").select("id")
      .eq("email", userEmail).maybeSingle()
      .then(({ data }) => { setCurrentEmployee(data); load("all", data?.id); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(sc: Scope = scope, empId?: string) {
    setLoading(true);
    const eid      = empId || currentEmployee?.id || "";
    const ep       = userEmail ? `&email=${encodeURIComponent(userEmail)}` : "";
    const res      = await fetch(`/api/mail/files?scope=${sc}${eid ? `&employee_id=${eid}` : ""}${ep}`);
    const data     = await res.json();
    const loaded: FileShare[] = data.data || [];
    setFiles(loaded);
    setLoading(false);

    if (sc === "trash") return;

    // Background: fetch real sizes for email attachments stored without size
    const needSize = loaded.filter(
      f => f.source === "email" && !f.file_size && f.storage_url?.startsWith("/api/mail/attachments")
    );
    if (!needSize.length) return;

    const msgMap = new Map<string, { accountId: string; folderId: string; messageId: string }>();
    for (const f of needSize) {
      const p   = new URLSearchParams(f.storage_url.split("?")[1] || "");
      const mid = p.get("messageId") || "";
      if (mid && !msgMap.has(mid)) {
        msgMap.set(mid, {
          accountId: p.get("accountId") || "",
          folderId:  p.get("folderId")  || "",
          messageId: mid,
        });
      }
    }
    try {
      const sizeRes = await fetch("/api/mail/files/size", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...msgMap.values()] }),
      });
      const { sizes } = await sizeRes.json();
      if (!sizes || !Object.keys(sizes).length) return;
      setFiles(prev => prev.map(f => {
        if (f.source !== "email" || f.file_size) return f;
        const p   = new URLSearchParams((f.storage_url.split("?")[1] || ""));
        const key = `${p.get("messageId")}_${p.get("attachmentId")}`;
        return sizes[key] ? { ...f, file_size: sizes[key] } : f;
      }));
    } catch (_) {}
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (inputRef.current) inputRef.current.value = "";

    if (file.size > 10 * 1024 * 1024) {
      showToast("File too large — maximum upload size is 10 MB.", "error");
      return;
    }

    // Build client-side preview URL for images
    const isImage = file.type.startsWith("image/");
    const previewUrl = isImage ? URL.createObjectURL(file) : null;

    setUploading(true);
    setUploadState({
      filename: file.name, fileSize: file.size, fileType: file.type,
      previewUrl, progress: 0, status: "preparing",
    });

    const fd = new FormData();
    fd.append("file", file);
    // Pass email so server can resolve employee ID via admin client (bypasses RLS)
    if (userEmail) fd.append("email", userEmail);
    // Also send employee_id if already resolved on client
    if (currentEmployee?.id) fd.append("employee_id", currentEmployee.id);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (ev) => {
      if (!ev.lengthComputable) return;
      const pct = Math.min(85, Math.round((ev.loaded / ev.total) * 85));
      setUploadState(p => p ? { ...p, progress: pct, status: "uploading" } : null);
    });

    xhr.addEventListener("load", () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.data) {
          setUploadState(p => p ? { ...p, progress: 100, status: "done" } : null);
          setFiles(prev => [{ ...data.data, source: "upload" } as FileShare, ...prev]);
          setTimeout(() => { setUploadState(null); setUploading(false); }, 1800);
        } else {
          setUploadState(p => p ? { ...p, status: "error", errorMsg: data.error || "Upload failed." } : null);
          setUploading(false);
        }
      } catch {
        setUploadState(p => p ? { ...p, status: "error", errorMsg: "Unexpected response." } : null);
        setUploading(false);
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    });

    xhr.addEventListener("error", () => {
      setUploadState(p => p ? { ...p, status: "error", errorMsg: "Network error." } : null);
      setUploading(false);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    });

    // Animate 85→95% while server processes base64 conversion
    xhr.addEventListener("loadstart", () => {
      setUploadState(p => p ? { ...p, status: "uploading" } : null);
    });

    xhr.open("POST", "/api/mail/files");
    xhr.send(fd);

    // After browser finishes sending, tick to "processing"
    setTimeout(() => {
      setUploadState(p =>
        p && p.status === "uploading" && p.progress >= 84
          ? { ...p, progress: 92, status: "processing" }
          : p
      );
    }, 400);
  }

  // Uploaded file → DB soft-delete
  async function softDelete(id: string) {
    setActing(id);
    await fetch(`/api/mail/files?id=${id}`, { method: "DELETE" });
    setFiles(prev => prev.filter(f => f.id !== id));
    showToast("Moved to Trash.", "success");
    setActing(null);
  }

  // Email file → localStorage trash
  function dismissEmailFile(file: FileShare) {
    if (dismissedIds.has(file.id)) return;
    setDismissedEmailFiles(prev => {
      const updated = [...prev, file];
      saveDismissed(updated);
      return updated;
    });
    setFiles(prev => prev.filter(f => f.id !== file.id));
    showToast("Moved to Trash.", "success");
  }

  // Unified delete handler
  function handleDelete(f: FileShare) {
    if (f.source === "email") dismissEmailFile(f);
    else softDelete(f.id);
  }

  // Restore uploaded file from DB trash
  async function restoreUpload(id: string) {
    setActing(id);
    await fetch("/api/mail/files", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setFiles(prev => prev.filter(f => f.id !== id));
    showToast("File restored.", "success");
    setActing(null);
  }

  // Restore dismissed email file (remove from localStorage trash)
  function restoreEmailFile(fileId: string) {
    setDismissedEmailFiles(prev => {
      const updated = prev.filter(f => f.id !== fileId);
      saveDismissed(updated);
      return updated;
    });
    showToast("File restored.", "success");
  }

  // Permanent delete uploaded file
  async function permanentDeleteUpload(id: string) {
    setActing(id);
    await fetch(`/api/mail/files?id=${id}&permanent=true`, { method: "DELETE" });
    setFiles(prev => prev.filter(f => f.id !== id));
    showToast("File permanently deleted.", "success");
    setActing(null);
  }

  // Permanently delete email file — removes from Trash AND hides from all views permanently
  function permanentDeleteEmail(fileId: string) {
    // Remove from Trash list
    setDismissedEmailFiles(prev => {
      const updated = prev.filter(f => f.id !== fileId);
      saveDismissed(updated);
      return updated;
    });
    // Add to permanent-deleted set so it never shows in All Files again
    setPermDeletedEmailIds(prev => {
      const updated = new Set([...prev, fileId]);
      savePermDeleted(updated);
      return updated;
    });
    showToast("File permanently deleted.", "success");
  }

  function switchScope(sc: Scope) {
    setScope(sc);
    setSelectedIds(new Set());
    load(sc);
  }

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(displayFiles.map(f => f.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  async function bulkDelete() {
    const ids = [...selectedIds];
    const selected = displayFiles.filter(f => ids.includes(f.id));
    const emailFiles  = selected.filter(f => f.source === "email");
    const uploadFiles = selected.filter(f => f.source !== "email");

    if (isTrash) {
      // Permanent delete
      if (emailFiles.length) {
        setDismissedEmailFiles(prev => {
          const updated = prev.filter(f => !emailFiles.find(e => e.id === f.id));
          saveDismissed(updated);
          return updated;
        });
        setPermDeletedEmailIds(prev => {
          const updated = new Set([...prev, ...emailFiles.map(f => f.id)]);
          savePermDeleted(updated);
          return updated;
        });
      }
      if (uploadFiles.length) {
        await Promise.all(uploadFiles.map(f =>
          fetch(`/api/mail/files?id=${f.id}&permanent=true`, { method: "DELETE" })
        ));
        setFiles(prev => prev.filter(f => !uploadFiles.find(u => u.id === f.id)));
      }
      showToast(`${ids.length} file(s) permanently deleted.`, "success");
    } else {
      // Move to Trash
      if (emailFiles.length) {
        setDismissedEmailFiles(prev => {
          const fresh = emailFiles.filter(f => !prev.find(d => d.id === f.id));
          const updated = [...prev, ...fresh];
          saveDismissed(updated);
          return updated;
        });
        setFiles(prev => prev.filter(f => !emailFiles.find(e => e.id === f.id)));
      }
      if (uploadFiles.length) {
        await Promise.all(uploadFiles.map(f =>
          fetch(`/api/mail/files?id=${f.id}`, { method: "DELETE" })
        ));
        setFiles(prev => prev.filter(f => !uploadFiles.find(u => u.id === f.id)));
      }
      showToast(`${ids.length} file(s) moved to Trash.`, "success");
    }
    setSelectedIds(new Set());
  }

  async function bulkRestore() {
    const ids = [...selectedIds];
    const allTrash = [...files, ...dismissedEmailFiles];
    const selected  = allTrash.filter(f => ids.includes(f.id));
    const emailFiles  = selected.filter(f => f.source === "email");
    const uploadFiles = selected.filter(f => f.source !== "email");

    if (emailFiles.length) {
      setDismissedEmailFiles(prev => {
        const updated = prev.filter(f => !emailFiles.find(e => e.id === f.id));
        saveDismissed(updated);
        return updated;
      });
    }
    if (uploadFiles.length) {
      await Promise.all(uploadFiles.map(f =>
        fetch("/api/mail/files", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: f.id }),
        })
      ));
      setFiles(prev => prev.filter(f => !uploadFiles.find(u => u.id === f.id)));
    }
    showToast(`${ids.length} file(s) restored.`, "success");
    setSelectedIds(new Set());
  }

  const isTrash = scope === "trash";

  // Active view: exclude dismissed AND permanently deleted email files
  const activeFiles = files.filter(f =>
    !(f.source === "email" && (dismissedIds.has(f.id) || permDeletedEmailIds.has(f.id)))
  );

  // Trash view: uploaded DB trash + dismissed email files
  const trashItems = isTrash ? [...files, ...dismissedEmailFiles] : [];

  function applyFilters(list: FileShare[]) {
    let out = list;
    if (search) {
      const q = search.toLowerCase();
      out = out.filter(f =>
        f.filename?.toLowerCase().includes(q) || f.subject?.toLowerCase().includes(q)
      );
    }
    return out.slice().sort((a, b) => {
      switch (sort) {
        case "date_asc":  return new Date(a.created_at||0).getTime() - new Date(b.created_at||0).getTime();
        case "size_desc": return (b.file_size||0) - (a.file_size||0);
        case "size_asc":  return (a.file_size||0) - (b.file_size||0);
        case "name_asc":  return (a.filename||"").localeCompare(b.filename||"");
        case "name_desc": return (b.filename||"").localeCompare(a.filename||"");
        default:          return new Date(b.created_at||0).getTime() - new Date(a.created_at||0).getTime();
      }
    });
  }

  const displayFiles = applyFilters(isTrash ? trashItems : activeFiles);

  // Stats always based on the active (non-trash) view
  const statsBase  = isTrash ? [] : activeFiles;
  const emailCount  = statsBase.filter(f => f.source === "email").length;
  const uploadCount = statsBase.filter(f => f.source !== "email").length;
  const totalSize   = statsBase.reduce((a, f) => a + (f.file_size || 0), 0);
  const trashCount  = dismissedEmailFiles.length; // badge hint

  return (
    <DashboardShell
      moduleKey="mail_files"
      title="File Share"
      subtitle="All files shared via email and manual uploads."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(scope)}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
          <label className={cn(
            "flex items-center gap-1.5 h-9 px-4 rounded-xl cursor-pointer text-xs font-bold transition-all shadow-sm select-none",
            uploading
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}>
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploading ? "Uploading…" : "Upload File"}
            <input ref={inputRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      }
    >
      {/* Stats — hidden in Trash view */}
      {!isTrash && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
          {[
            { label: "Total Files", value: statsBase.length,     icon: Paperclip, color: "text-blue-500",    bg: "bg-blue-500/10" },
            { label: "Total Size",  value: formatBytes(totalSize), icon: Archive,   color: "text-amber-500",  bg: "bg-amber-500/10" },
            { label: "From Email",  value: emailCount,             icon: Mail,      color: "text-sky-500",    bg: "bg-sky-500/10" },
            { label: "Uploaded",    value: uploadCount,            icon: Upload,    color: "text-emerald-500", bg: "bg-emerald-500/10" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label} className="overflow-hidden border-border/60">
              <CardContent className="flex items-center gap-3 p-4">
                <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl", bg)}>
                  <Icon size={16} className={color} />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
                  <p className={cn("text-xl font-black leading-tight", color)}>{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs + Search */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Tabs value={scope} onValueChange={(v) => switchScope(v as Scope)}>
          <TabsList className="h-9">
            <TabsTrigger value="all"    className="gap-1.5 text-xs px-3">
              <Paperclip size={12}/> All Files
            </TabsTrigger>
            <TabsTrigger value="mine"   className="gap-1.5 text-xs px-3">
              <Upload size={12}/> Sent by Me
            </TabsTrigger>
            <TabsTrigger value="shared" className="gap-1.5 text-xs px-3">
              <Inbox size={12}/> Received
            </TabsTrigger>
            <TabsTrigger value="uploaded" className="gap-1.5 text-xs px-3">
              <Upload size={12}/> Uploaded
            </TabsTrigger>
            <TabsTrigger value="trash"  className="gap-1.5 text-xs px-3 data-[state=active]:text-destructive">
              <Trash2 size={12}/>
              Trash
              {trashCount > 0 && (
                <span className="ml-1 h-4 min-w-[16px] px-1 rounded-full bg-destructive/20 text-destructive text-[9px] font-bold flex items-center justify-center">
                  {trashCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search files or subjects…"
            className="w-full h-9 pl-8 pr-3 rounded-xl border border-border bg-background text-xs text-foreground outline-none focus:border-primary transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Sort dropdown */}
        <div className="relative flex items-center">
          <ArrowUpDown size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="h-9 pl-7 pr-7 rounded-xl border border-border bg-background text-xs text-foreground outline-none focus:border-primary transition-colors appearance-none cursor-pointer"
          >
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="size_desc">Largest first</option>
            <option value="size_asc">Smallest first</option>
            <option value="name_asc">Name A → Z</option>
            <option value="name_desc">Name Z → A</option>
          </select>
        </div>
      </div>

      {/* Trash notice */}
      {isTrash && (
        <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-xl px-4 py-2.5 border border-border">
          <Trash2 size={12} className="text-destructive" />
          Deleted files appear here. Restore to recover, or permanently delete to remove forever.
        </div>
      )}

      {/* File Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : displayFiles.length === 0 ? (
        <Card className="border-dashed border-border/60">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            {isTrash
              ? <Trash2 size={36} className="text-muted-foreground/20" />
              : <Paperclip size={36} className="text-muted-foreground/20" />}
            <p className="text-sm font-semibold text-muted-foreground">
              {isTrash ? "Trash is empty" : "No files found"}
            </p>
            <p className="text-xs text-muted-foreground/60">
              {isTrash
                ? "Deleted files will appear here"
                : scope === "all"
                  ? "Upload files or open emails with attachments to see them here"
                  : scope === "uploaded"
                    ? "No manually uploaded files yet — click Upload File to add one"
                    : "No files in this category yet"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {displayFiles.map((f) => {
            const isSelected = selectedIds.has(f.id);
            return (
            <Card
              key={f.id}
              className={cn(
                "group cursor-pointer overflow-hidden border-border/60 hover:border-primary/40 hover:shadow-md transition-all duration-150 p-0 gap-0 relative",
                isTrash && "opacity-70 hover:opacity-100",
                isSelected && "border-primary ring-2 ring-primary/30"
              )}
              onClick={() => {
                if (selectedIds.size > 0) { toggleSelect(f.id, { stopPropagation: () => {} } as any); return; }
                if (!isTrash) setPreview(f);
              }}
            >
              {/* Checkbox — top-left, shows on hover or when anything is selected */}
              <div
                className={cn(
                  "absolute top-2 left-2 z-20 transition-opacity",
                  isSelected || selectedIds.size > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
                onClick={e => toggleSelect(f.id, e)}
              >
                <div className={cn(
                  "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                  isSelected
                    ? "bg-primary border-primary"
                    : "bg-background/80 border-border backdrop-blur-sm"
                )}>
                  {isSelected && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </div>

              {/* Thumbnail */}
              <FileThumbnail f={f} />

              {/* Info */}
              <CardContent className="p-3 pb-2 relative">
                {/* Source badge */}
                <div className="absolute top-2 right-2 flex gap-1">
                  {f.source === "email" ? (
                    <Badge className="h-4 text-[9px] px-1.5 gap-0.5 bg-sky-500/10 text-sky-600 border-sky-500/20 hover:bg-sky-500/20">
                      <Mail size={8} /> Mail
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="h-4 text-[9px] px-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                      ORG
                    </Badge>
                  )}
                </div>

                <p className="text-xs font-semibold text-foreground truncate pr-10 mb-0.5" title={f.filename}>
                  {f.filename}
                </p>
                {f.source === "email" && f.subject && (
                  <p className="text-[9px] text-muted-foreground truncate mb-0.5 italic" title={f.subject}>
                    {f.subject}
                  </p>
                )}
                {(f.external_from || f.from_address) && (
                  <p className="text-[9px] text-muted-foreground/80 truncate mb-0.5" title={f.external_from || f.from_address}>
                    From: {f.external_from || f.from_address}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground">{formatBytes(f.file_size)}</p>

                <div className="flex items-center gap-1 text-[9px] text-muted-foreground mt-1.5">
                  <Clock size={9} />
                  {f.created_at ? formatDistanceToNow(new Date(f.created_at), { addSuffix: true }) : "—"}
                </div>
              </CardContent>

              {/* Hover action bar — active files only */}
              {!isTrash && (
                <div className="flex items-center justify-center gap-1 px-3 pb-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={f.storage_url} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    title="Open in browser"
                    className="flex-1 flex items-center justify-center h-7 rounded-lg bg-muted hover:bg-primary hover:text-primary-foreground text-muted-foreground transition-all text-[10px] font-semibold gap-1"
                  >
                    <ExternalLink size={10} /> Open
                  </a>
                  <a
                    href={f.storage_url} download={f.filename}
                    onClick={e => e.stopPropagation()}
                    title="Download file"
                    className="flex-1 flex items-center justify-center h-7 rounded-lg bg-muted hover:bg-primary hover:text-primary-foreground text-muted-foreground transition-all text-[10px] font-semibold gap-1"
                  >
                    <Download size={10} /> Save
                  </a>
                  {/* Delete — shows for ALL files */}
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(f); }}
                    disabled={acting === f.id}
                    title="Move to Trash"
                    className="h-7 w-7 flex items-center justify-center rounded-lg bg-muted hover:bg-destructive hover:text-white text-muted-foreground transition-all flex-shrink-0"
                  >
                    {acting === f.id
                      ? <Loader2 size={10} className="animate-spin" />
                      : <Trash2 size={10} />
                    }
                  </button>
                </div>
              )}

              {/* Trash actions */}
              {isTrash && (
                <div className="flex items-center gap-1 px-3 pb-3">
                  <Button
                    variant="outline" size="sm"
                    className="flex-1 h-7 text-[10px] gap-1"
                    onClick={e => {
                      e.stopPropagation();
                      if (f.source === "email") restoreEmailFile(f.id);
                      else restoreUpload(f.id);
                    }}
                    disabled={acting === f.id}
                  >
                    <RotateCcw size={10} /> Restore
                  </Button>
                  <Button
                    variant="destructive" size="sm"
                    className="flex-1 h-7 text-[10px] gap-1"
                    onClick={e => {
                      e.stopPropagation();
                      if (f.source === "email") permanentDeleteEmail(f.id);
                      else permanentDeleteUpload(f.id);
                    }}
                    disabled={acting === f.id}
                  >
                    {acting === f.id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                    Delete
                  </Button>
                </div>
              )}
            </Card>
            );
          })}
        </div>
      )}

      {/* Floating multi-select action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 bg-background border border-border rounded-2xl shadow-2xl ring-1 ring-primary/10">
          {/* Count + select all */}
          <span className="text-sm font-bold text-foreground pr-1">
            {selectedIds.size} selected
          </span>
          <Button
            variant="ghost" size="sm"
            className="h-7 text-[11px] text-muted-foreground hover:text-foreground px-2"
            onClick={selectedIds.size === displayFiles.length ? deselectAll : selectAll}
          >
            {selectedIds.size === displayFiles.length ? "Deselect All" : `Select All (${displayFiles.length})`}
          </Button>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Trash: Restore + Delete Forever; Active: Move to Trash */}
          {isTrash ? (
            <>
              <Button
                variant="outline" size="sm"
                className="h-7 text-[11px] gap-1.5"
                onClick={bulkRestore}
              >
                <RotateCcw size={11}/> Restore
              </Button>
              <Button
                variant="destructive" size="sm"
                className="h-7 text-[11px] gap-1.5"
                onClick={bulkDelete}
              >
                <Trash2 size={11}/> Delete Forever
              </Button>
            </>
          ) : (
            <Button
              variant="destructive" size="sm"
              className="h-7 text-[11px] gap-1.5"
              onClick={bulkDelete}
            >
              <Trash2 size={11}/> Move to Trash
            </Button>
          )}

          <div className="w-px h-5 bg-border mx-1" />

          <button
            onClick={deselectAll}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Cancel selection"
          >
            <X size={15}/>
          </button>
        </div>
      )}

      {/* ── Upload Progress Overlay ─────────────────────────────── */}
      {uploadState && (() => {
        const fn = uploadState.filename.toLowerCase();
        const ft = uploadState.fileType;
        const isDone  = uploadState.status === "done";
        const isError = uploadState.status === "error";
        const isActive = !isDone && !isError;

        const STEPS: { key: UploadState["status"]; label: string }[] = [
          { key: "preparing",  label: "Prepare"  },
          { key: "uploading",  label: "Transfer" },
          { key: "processing", label: "Process"  },
          { key: "done",       label: "Complete" },
        ];
        const stepOrder = ["preparing","uploading","processing","done"];
        const currentIdx = stepOrder.indexOf(uploadState.status);

        const FileIcon = () => {
          if (ft.includes("pdf") || fn.endsWith(".pdf"))
            return <FileText size={26} className="text-rose-500" />;
          if (ft.includes("word") || /\.(docx?|doc)$/.test(fn))
            return <FileText size={26} className="text-blue-500" />;
          if (ft.includes("sheet") || ft.includes("excel") || /\.(xlsx?|csv)$/.test(fn))
            return <FileText size={26} className="text-emerald-600" />;
          if (ft.includes("zip") || /\.(zip|rar|7z|gz|tar)$/.test(fn))
            return <Archive size={26} className="text-amber-500" />;
          if (ft.startsWith("video/"))
            return <Film size={26} className="text-purple-500" />;
          if (ft.startsWith("text/"))
            return <FileText size={26} className="text-slate-500" />;
          return <File size={26} className="text-muted-foreground" />;
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-background rounded-2xl shadow-2xl border border-border overflow-hidden">

              {/* ── Header ── */}
              <div className={cn(
                "flex items-center justify-between px-5 py-3.5 border-b border-border",
                isDone  ? "bg-emerald-500/5" :
                isError ? "bg-destructive/5" :
                "bg-primary/5"
              )}>
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    isDone  ? "bg-emerald-500" :
                    isError ? "bg-destructive" :
                    "bg-primary animate-pulse"
                  )} />
                  <span className="text-sm font-bold text-foreground">
                    {isDone  ? "Upload Complete" :
                     isError ? "Upload Failed"   :
                     "Uploading File…"}
                  </span>
                </div>
                {(isDone || isError) && (
                  <button
                    onClick={() => setUploadState(null)}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="p-5 space-y-4">

                {/* ── File Info Card ── */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border">
                  <div className="w-12 h-12 rounded-xl bg-background border border-border flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
                    {uploadState.previewUrl
                      ? <img src={uploadState.previewUrl} alt="" className="w-full h-full object-contain" />
                      : <FileIcon />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate" title={uploadState.filename}>
                      {uploadState.filename}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{formatBytes(uploadState.fileSize)}</span>
                      <span className="text-muted-foreground/40 text-xs">·</span>
                      <span className="text-[10px] text-muted-foreground uppercase font-medium">
                        {fn.split(".").pop() || "file"}
                      </span>
                    </div>
                  </div>
                  {isDone && <CheckCircle2 size={20} className="text-emerald-500 flex-shrink-0" />}
                  {isError && <AlertCircle size={20} className="text-destructive flex-shrink-0" />}
                </div>

                {/* ── Progress bar ── */}
                {!isError && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">
                        {uploadState.status === "preparing"  && "Getting ready…"}
                        {uploadState.status === "uploading"  && "Transferring file…"}
                        {uploadState.status === "processing" && "Processing on server…"}
                        {uploadState.status === "done"       && "Saved to File Share"}
                      </span>
                      <span className={cn(
                        "text-xs font-bold tabular-nums",
                        isDone ? "text-emerald-500" : "text-primary"
                      )}>
                        {uploadState.progress}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500 ease-out",
                          isDone ? "bg-emerald-500" : "bg-primary"
                        )}
                        style={{ width: `${uploadState.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* ── Step tracker ── */}
                {!isError && (
                  <div className="flex items-center justify-between pt-1">
                    {STEPS.map((step, i) => {
                      const stepIdx = stepOrder.indexOf(step.key);
                      const state =
                        isError               ? "pending" :
                        stepIdx < currentIdx  ? "done"    :
                        stepIdx === currentIdx ? "active"  :
                        "pending";
                      return (
                        <div key={step.key} className="flex items-center gap-1.5">
                          <div className="flex flex-col items-center gap-1">
                            <div className={cn(
                              "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all",
                              state === "done"   ? "bg-emerald-500 border-emerald-500 text-white" :
                              state === "active" ? "bg-primary border-primary text-primary-foreground" :
                              "bg-background border-border text-muted-foreground"
                            )}>
                              {state === "done"
                                ? <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                : i + 1
                              }
                            </div>
                            <span className={cn(
                              "text-[9px] font-medium",
                              state === "done"   ? "text-emerald-600" :
                              state === "active" ? "text-primary font-bold" :
                              "text-muted-foreground"
                            )}>
                              {step.label}
                            </span>
                          </div>
                          {i < STEPS.length - 1 && (
                            <div className={cn(
                              "h-px w-8 mb-3 transition-colors",
                              state === "done" ? "bg-emerald-400" : "bg-border"
                            )} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Error message ── */}
                {isError && (
                  <div className="flex items-start gap-2.5 p-3.5 bg-destructive/8 border border-destructive/20 rounded-xl">
                    <AlertCircle size={15} className="text-destructive mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-destructive mb-0.5">Upload failed</p>
                      <p className="text-xs text-destructive/80 leading-relaxed">
                        {uploadState.errorMsg || "Something went wrong. Please try again."}
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Success message ── */}
                {isDone && (
                  <div className="flex items-center gap-2.5 p-3.5 bg-emerald-500/8 border border-emerald-500/20 rounded-xl">
                    <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
                    <p className="text-xs font-semibold text-emerald-600">
                      File saved to File Share — closing automatically…
                    </p>
                  </div>
                )}
              </div>

              {/* ── Footer ── */}
              {isError && (
                <div className="px-5 pb-5">
                  <Button
                    variant="outline"
                    className="w-full h-9 text-xs font-semibold"
                    onClick={() => setUploadState(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── File Details Modal ─────────────────────────────────── */}
      <Dialog open={!!preview} onOpenChange={open => !open && setPreview(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[440px] p-0 gap-0 overflow-hidden rounded-2xl">
          {preview && (
            <>
              {/* ── Header ── */}
              <DialogHeader className="px-4 pt-4 pb-3 border-b border-border">
                <div className="flex items-start gap-2.5 pr-6">
                  {/* File type colour dot */}
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                    preview.file_type?.includes("pdf")                             ? "bg-rose-500/10"    :
                    preview.file_type?.includes("word") || preview.filename?.endsWith(".docx")  ? "bg-blue-500/10"    :
                    preview.file_type?.includes("sheet") || preview.filename?.endsWith(".xlsx") ? "bg-emerald-500/10" :
                    preview.file_type?.startsWith("image/")                        ? "bg-purple-500/10"  :
                    preview.file_type?.startsWith("video/")                        ? "bg-amber-500/10"   :
                    "bg-muted"
                  )}>
                    {preview.file_type?.includes("pdf") || preview.filename?.toLowerCase().endsWith(".pdf")
                      ? <FileText size={15} className="text-rose-500" />
                      : preview.file_type?.startsWith("image/")
                        ? <File size={15} className="text-purple-500" />
                        : <File size={15} className="text-muted-foreground" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <DialogTitle className="text-sm font-bold text-foreground leading-snug break-all line-clamp-2">
                      {preview.filename}
                    </DialogTitle>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {preview.source === "email" ? (
                        <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-semibold bg-sky-500/10 text-sky-600 border border-sky-500/20">
                          <Mail size={9}/> From Mail
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          <Upload size={9}/> Uploaded
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {preview.created_at
                          ? format(new Date(preview.created_at), "MMM d, yyyy · h:mm a")
                          : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              {/* ── Preview ── */}
              <div className="h-44 w-full bg-muted/25 border-b border-border overflow-hidden">
                <FileThumbnail f={preview} tall />
              </div>

              {/* ── Metadata cards ── */}
              <div className="p-4 space-y-2.5">

                {/* Size + Type row */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted/40 rounded-xl px-3 py-2.5 border border-border/60">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Size</p>
                    <p className="text-sm font-bold text-foreground">{formatBytes(preview.file_size)}</p>
                  </div>
                  <div className="bg-muted/40 rounded-xl px-3 py-2.5 border border-border/60">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Type</p>
                    <p className="text-sm font-bold text-foreground truncate" title={friendlyType(preview.file_type, preview.filename)}>
                      {friendlyType(preview.file_type, preview.filename)}
                    </p>
                  </div>
                </div>

                {/* Candidate-uploaded: who it's from */}
                {preview.external_from && (
                  <div className="bg-emerald-500/5 rounded-xl px-3 py-2.5 border border-emerald-500/10">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600/70 mb-1">From (candidate)</p>
                    <p className="text-xs font-semibold text-foreground truncate">{preview.external_from}</p>
                  </div>
                )}

                {/* Email-specific: Subject + From */}
                {preview.source === "email" && (preview.subject || preview.from_address) && (
                  <div className="space-y-2">
                    {preview.subject && (
                      <div className="bg-sky-500/5 rounded-xl px-3 py-2.5 border border-sky-500/10">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-sky-500/70 mb-1">Subject</p>
                        <p className="text-xs font-semibold text-foreground leading-relaxed line-clamp-2">
                          {preview.subject}
                        </p>
                      </div>
                    )}
                    {preview.from_address && (
                      <div className="bg-sky-500/5 rounded-xl px-3 py-2.5 border border-sky-500/10">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-sky-500/70 mb-1">From</p>
                        <p className="text-xs font-semibold text-foreground truncate">{preview.from_address}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Actions ── */}
              <div className="flex gap-2 px-4 pb-4 pt-0">
                <Button variant="outline" size="sm" className="flex-1 h-9 gap-1.5 text-xs font-semibold rounded-xl" asChild>
                  {/* Uploaded files: serve via API route (avoids data: URL blank tab / "Not secure").
                      Email files: open the attachment proxy URL directly. */}
                  <a
                    href={preview.source === "upload"
                      ? `/api/mail/files/open?id=${preview.id}`
                      : preview.storage_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink size={12}/> Open
                  </a>
                </Button>
                <Button size="sm" className="flex-1 h-9 gap-1.5 text-xs font-semibold rounded-xl" asChild>
                  <a href={preview.storage_url} download={preview.filename}>
                    <Download size={12}/> Download
                  </a>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
