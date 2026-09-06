"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useState, useEffect, useRef } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useToast } from "@/components/ui/ToastLegacy";
import { useAuth } from "@/components/layout/AuthProvider";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import {
  Send, X, Paperclip, Layers, Bot, Sparkles, Loader2,
  ChevronDown, ChevronUp, Bold, Italic, Link, List, Minus, Plus,
  FileText, Check, RefreshCw, AtSign, Search, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Template = { id: string; name: string; category: string; subject: string; body: string };
type Employee = { id: string; name: string; email: string; designation: string };

// localStorage keys — persist AI result and compose draft across refresh + navigation
const LS_AI    = "nexawork_compose_ai";
const LS_DRAFT = "nexawork_compose_draft";

export default function ComposePage() {
  const { user }    = useAuth();
  const { showToast } = useToast();
  const router      = useRef(typeof window !== "undefined" ? window : null);

  const [to,      setTo]      = useState<string[]>([]);
  const [toInput, setToInput] = useState("");
  const [cc,      setCc]      = useState<string[]>([]);
  const [ccInput, setCcInput] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [bcc,     setBcc]     = useState<string[]>([]);
  const [bccInput, setBccInput] = useState("");
  const [subject, setSubject] = useState("");
  const [body,    setBody]    = useState("");
  const [sending, setSending] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [attachments, setAttachments] = useState<{
    id: string;
    name: string;
    size: number;
    progress: number;
    error: string | null;
    storeName: string | null;
    attachmentName: string | null;
    attachmentPath: string | null;
    xhr?: XMLHttpRequest | null;
  }[]>([]);

  const [templates,        setTemplates]        = useState<Template[]>([]);
  const [showTemplates,    setShowTemplates]    = useState(false);
  const [employeeSuggestions, setEmployeeSuggestions] = useState<Employee[]>([]);
  const [activeInput,      setActiveInput]      = useState<"to" | "cc" | "bcc" | null>(null);

  const [aiLoading,   setAiLoading]   = useState(false);
  const [aiPanel,     setAiPanel]     = useState(false);
  const [aiAction,    setAiAction]    = useState<"improve_tone" | "shorten" | "">("");
  const [improvedBody,    setImprovedBody]    = useState("");
  const [improvedSubject, setImprovedSubject] = useState("");
  const [improvedIsHtml,  setImprovedIsHtml]  = useState(false);
  const [suggestedSubject, setSuggestedSubject] = useState("");
  const [isHtmlBody,  setIsHtmlBody]  = useState(false);
  const [showSource,  setShowSource]  = useState(false);

  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const htmlBodyRef    = useRef<HTMLDivElement>(null);
  const lastSetBody    = useRef("");
  const isMountedRef   = useRef(true);
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── @-file mention state ────────────────────────────────────────
  const [filePickerFiles,   setFilePickerFiles]   = useState<any[]>([]);
  const [atMention,         setAtMention]         = useState<{ query: string; start: number } | null>(null);
  const [attachingMentionId, setAttachingMentionId] = useState<string | null>(null);

  // Track mount state so async fetch callbacks don't call setState after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // ── On mount: restore draft + AI state from localStorage ──────────────────
  useEffect(() => {
    // Restore compose draft (body, subject, recipients)
    try {
      const d = localStorage.getItem(LS_DRAFT);
      if (d) {
        const { body: b, subject: s, to: t, cc: c, bcc: bc, isHtmlBody: ih } = JSON.parse(d);
        if (b) { lastSetBody.current = ""; setBody(b); }
        if (s) setSubject(s);
        if (Array.isArray(t) && t.length) setTo(t);
        if (Array.isArray(c) && c.length) setCc(c);
        if (Array.isArray(bc) && bc.length) setBcc(bc);
        if (ih) setIsHtmlBody(true);
      }
    } catch {}

    // Restore AI panel — handles both "done" (result ready) and "pending" (retrigger)
    try {
      const a = localStorage.getItem(LS_AI);
      if (!a) return;
      const parsed = JSON.parse(a);
      if (parsed.status === "done" && parsed.ib) {
        setImprovedBody(parsed.ib);
        setImprovedSubject(parsed.is || "");
        setImprovedIsHtml(!!parsed.iih);
        setAiAction(parsed.aa || "improve_tone");
        setAiPanel(true);
      } else if (parsed.status === "pending" && parsed.aa && parsed.pendingBody) {
        // AI was mid-flight when user left — show loading panel and retrigger
        setAiAction(parsed.aa);
        setAiPanel(true);
        setAiLoading(true);
        // Tiny delay so the component is fully ready before the fetch starts
        setTimeout(() => {
          if (isMountedRef.current) {
            aiImprove(parsed.aa, parsed.pendingBody, parsed.pendingSubject || "");
          }
        }, 150);
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-save compose draft to localStorage (debounced 600 ms) ───────────
  useEffect(() => {
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      if (body || subject || to.length) {
        try {
          localStorage.setItem(LS_DRAFT, JSON.stringify({ body, subject, to, cc, bcc, isHtmlBody }));
        } catch {}
      }
    }, 600);
    return () => { if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current); };
  }, [body, subject, to, cc, bcc, isHtmlBody]);

  useEffect(() => {
    supabase.from("mail_templates").select("id,name,category,subject,body").eq("status","active")
      .then(({ data }) => setTemplates(data || []));
  }, []);

  // Sync external body changes (AI / template apply) into the contentEditable div.
  // Skip when the change came from user typing (lastSetBody already matches body).
  useEffect(() => {
    if (isHtmlBody && htmlBodyRef.current && body !== lastSetBody.current) {
      htmlBodyRef.current.innerHTML = body;
      lastSetBody.current = body;
    }
  }, [body, isHtmlBody]);

  // Load File Share files once so @-mention has an instant list ready
  useEffect(() => {
    const empId = (user as any)?.id;
    const email = (user as any)?.email || "";
    const qs = new URLSearchParams({ scope: "all" });
    if (empId) qs.set("employee_id", empId);
    if (email) qs.set("email", email);
    fetch(`/api/mail/files?${qs}`)
      .then(r => r.json())
      .then(d => setFilePickerFiles(d.data || []))
      .catch(() => {});
  }, [user]);

  // Detect @ trigger while typing in the body textarea
  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val    = e.target.value;
    const cursor = e.target.selectionStart;
    setBody(val);

    // Walk backwards from cursor to find an @ that hasn't been separated by whitespace
    let atIdx = -1;
    for (let i = cursor - 1; i >= Math.max(0, cursor - 60); i--) {
      const ch = val[i];
      if (ch === "@") { atIdx = i; break; }
      if (ch === " " || ch === "\n" || ch === "\t") break;
    }
    setAtMention(atIdx >= 0 ? { query: val.slice(atIdx + 1, cursor), start: atIdx } : null);
  }

  // Insert a bold @mention chip and auto-attach the file.
  // Switches body to HTML mode so the mention renders as a real <strong> chip —
  // no ** asterisks ever visible to the user.
  async function pickMentionFile(file: any) {
    if (!atMention) return;
    setAtMention(null);

    const mentionHtml = `<strong style="color:#6366f1;font-weight:700;background:#ede9fe;padding:1px 6px;border-radius:4px;font-size:0.85em;">@${file.filename}</strong>&nbsp;`;

    if (!isHtmlBody) {
      // Plain-text mode → escape body to HTML and insert bold mention chip
      const esc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
      const before  = esc(body.slice(0, atMention.start));
      const after   = esc(body.slice(atMention.start + 1 + atMention.query.length));
      const newHtml = before + mentionHtml + after;
      // Reset lastSetBody BEFORE the state updates so the sync useEffect sees a
      // mismatch and populates the newly-mounted contentEditable div.
      // If we set lastSetBody = newHtml here, the effect skips the sync and the
      // div mounts blank — wiping the entire message body.
      lastSetBody.current = "";
      setBody(newHtml);
      setIsHtmlBody(true);
      setShowSource(false);
    } else if (htmlBodyRef.current) {
      // Already in HTML mode → delete the typed @query and insert chip at cursor
      htmlBodyRef.current.focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        try {
          range.setStart(range.startContainer, Math.max(0, range.startOffset - atMention.query.length - 1));
          range.deleteContents();
        } catch {}
      }
      document.execCommand("insertHTML", false, mentionHtml);
      const newHtml = htmlBodyRef.current.innerHTML;
      setBody(newHtml);
      lastSetBody.current = newHtml;
    }

    // Fetch binary and upload via the existing Zoho attachment flow.
    // uploadFile() has a dedup guard — double-mentioning the same file is safe.
    setAttachingMentionId(file.id);
    try {
      const url = file.source === "upload"
        ? `/api/mail/files/open?id=${file.id}`
        : file.storage_url;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("fetch failed");
      const blob    = await resp.blob();
      const fileObj = new File([blob], file.filename, { type: blob.type || file.file_type || "application/octet-stream" });
      uploadFile(fileObj);
    } catch {
      showToast(`Mention inserted — could not auto-attach ${file.filename}.`, "warning");
    } finally {
      setAttachingMentionId(null);
    }
  }

  async function searchEmployees(q: string) {
    if (!q || q.length < 2) { setEmployeeSuggestions([]); return; }
    const { data } = await supabase
      .from("employees")
      .select("id,name,email,designation")
      .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(6);
    setEmployeeSuggestions(data || []);
  }

  function addTag(list: string[], setList: (v: string[]) => void, setInput: (v: string) => void, value: string) {
    const trimmed = value.trim();
    if (trimmed && !list.includes(trimmed)) setList([...list, trimmed]);
    setInput("");
    setEmployeeSuggestions([]);
  }

  function removeTag(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.filter((v) => v !== value));
  }

  function applyTemplate(t: Template) {
    setSubject(t.subject);
    setBody(t.body);
    setShowTemplates(false);
    showToast(`Template "${t.name}" applied.`, "info");
  }

  function insertFormat(tag: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const sel   = body.substring(start, end);
    const insert = tag === "bold"   ? `**${sel || "text"}**`
                 : tag === "italic" ? `_${sel || "text"}_`
                 : tag === "list"   ? `\n• ${sel || "item"}`
                 : tag === "link"   ? `[${sel || "link text"}](url)`
                 : sel;
    setBody(body.substring(0, start) + insert + body.substring(end));
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + insert.length, start + insert.length); }, 0);
  }

  function dismissAiPanel() {
    setAiPanel(false);
    setImprovedBody("");
    setImprovedSubject("");
    setImprovedIsHtml(false);
    try { localStorage.removeItem(LS_AI); } catch {}
  }

  function applyAiSuggestion() {
    setBody(improvedBody);
    if (improvedSubject) setSubject(improvedSubject);
    setIsHtmlBody(improvedIsHtml);
    setShowSource(false);
    dismissAiPanel();
    showToast("AI suggestion applied.", "success");
  }

  // overrideBody / overrideSubject let the mount-time retrigger pass saved content
  // without waiting for React state to be populated.
  async function aiImprove(
    type: "improve_tone" | "shorten" | "suggest_subject",
    overrideBody?: string,
    overrideSubject?: string,
  ) {
    const effectiveBody    = overrideBody    ?? body;
    const effectiveSubject = overrideSubject ?? subject;

    if (!effectiveBody && type !== "suggest_subject") {
      if (isMountedRef.current) showToast("Write some content first.", "warning");
      return;
    }

    if (type !== "suggest_subject") {
      if (isMountedRef.current) {
        setAiAction(type);
        setImprovedBody("");
        setImprovedSubject("");
        setImprovedIsHtml(false);
        setAiPanel(true);
      }
      // Save pending state so remount can retrigger if still in progress
      try {
        localStorage.setItem(LS_AI, JSON.stringify({
          status: "pending",
          pendingBody: effectiveBody,
          pendingSubject: effectiveSubject,
          aa: type,
        }));
      } catch {}
    }

    if (isMountedRef.current) setAiLoading(true);

    try {
      const res = await fetch("/api/mail/ai/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, subject: effectiveSubject, body: effectiveBody }),
      });
      const data = await res.json();

      if (!res.ok) {
        try { localStorage.removeItem(LS_AI); } catch {}
        if (isMountedRef.current) { dismissAiPanel(); showToast(data.error || "AI unavailable — try again in 30 seconds.", "warning"); }
        return;
      }

      if (type === "improve_tone") {
        const result = data.improved || "";
        if (!result) {
          try { localStorage.removeItem(LS_AI); } catch {}
          if (isMountedRef.current) { dismissAiPanel(); showToast("AI returned empty response — try again.", "warning"); }
          return;
        }
        const rSubj = data.improvedSubject || effectiveSubject || "";
        // Write to localStorage FIRST — survives even if component is unmounted when fetch completes
        try { localStorage.setItem(LS_AI, JSON.stringify({ status: "done", ib: result, is: rSubj, iih: data.isHtml === true, aa: type })); } catch {}
        if (isMountedRef.current) { setImprovedBody(result); setImprovedSubject(rSubj); setImprovedIsHtml(data.isHtml === true); }

      } else if (type === "shorten") {
        const result = data.shortened || "";
        if (!result) {
          try { localStorage.removeItem(LS_AI); } catch {}
          if (isMountedRef.current) { dismissAiPanel(); showToast("AI returned empty response — try again.", "warning"); }
          return;
        }
        const rSubj = data.shortenedSubject || effectiveSubject || "";
        try { localStorage.setItem(LS_AI, JSON.stringify({ status: "done", ib: result, is: rSubj, iih: data.isHtml === true, aa: type })); } catch {}
        if (isMountedRef.current) { setImprovedBody(result); setImprovedSubject(rSubj); setImprovedIsHtml(data.isHtml === true); }

      } else if (type === "suggest_subject") {
        if (isMountedRef.current) setSuggestedSubject(data.subject || "");
      }
    } catch {
      try { localStorage.removeItem(LS_AI); } catch {}
      if (isMountedRef.current) { dismissAiPanel(); showToast("Network error — check your connection.", "error"); }
    } finally {
      if (isMountedRef.current) setAiLoading(false);
    }
  }

  async function saveDraft() {
    if (!body && !subject && !to.length) { showToast("Nothing to save.", "warning"); return; }
    setSaving(true);
    try {
      const employeeId = (user as any)?.id;
      const uploadedAttachments = attachments
        .filter((att) => att.progress === 100 && !att.error && att.storeName)
        .map((att) => ({
          storeName: att.storeName,
          attachmentName: att.attachmentName,
          attachmentPath: att.attachmentPath,
        }));

      await fetch("/api/mail/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          to,
          cc,
          bcc,
          subject,
          body,
          attachments: uploadedAttachments,
        }),
      });
      showToast("Draft saved.", "success");
    } finally {
      setSaving(false);
    }
  }

  function formatFileSize(bytes: number) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      uploadFile(file);
    });
    e.target.value = "";
  }

  function uploadFile(file: File) {
    // Dedup: skip silently if the same filename is already queued or attached
    if (attachments.some(att => att.name === file.name)) {
      showToast(`${file.name} is already attached.`, "info");
      return;
    }

    const id = Math.random().toString(36).substring(7);
    const newAttachment = {
      id,
      name: file.name,
      size: file.size,
      progress: 0,
      error: null,
      storeName: null,
      attachmentName: null,
      attachmentPath: null,
      xhr: null as XMLHttpRequest | null,
    };

    setAttachments((prev) => [...prev, newAttachment]);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("employee_id", (user as any)?.id || "");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/mail/attachments", true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setAttachments((prev) =>
          prev.map((att) => (att.id === id ? { ...att, progress: percent } : att))
        );
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.data && res.data.length > 0) {
            const uploaded = res.data[0];
            setAttachments((prev) =>
              prev.map((att) =>
                att.id === id
                  ? {
                      ...att,
                      progress: 100,
                      storeName: uploaded.storeName,
                      attachmentName: uploaded.attachmentName,
                      attachmentPath: uploaded.attachmentPath,
                    }
                  : att
              )
            );
          } else {
            throw new Error("Invalid response");
          }
        } catch {
          setAttachments((prev) =>
            prev.map((att) => (att.id === id ? { ...att, error: "Invalid response from server" } : att))
          );
        }
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          setAttachments((prev) =>
            prev.map((att) => (att.id === id ? { ...att, error: res.error || "Upload failed" } : att))
          );
        } catch {
          setAttachments((prev) =>
            prev.map((att) => (att.id === id ? { ...att, error: "Upload failed" } : att))
          );
        }
      }
    };

    xhr.onerror = () => {
      setAttachments((prev) =>
        prev.map((att) => (att.id === id ? { ...att, error: "Network error occurred" } : att))
      );
    };

    xhr.send(formData);

    // Track the XHR in state
    setAttachments((prev) =>
      prev.map((att) => (att.id === id ? { ...att, xhr } : att))
    );
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const target = prev.find((att) => att.id === id);
      if (target && target.xhr) {
        target.xhr.abort();
      }
      return prev.filter((att) => att.id !== id);
    });
  }

  async function handleSend() {
    if (!to.length)    { showToast("Add at least one recipient.", "warning"); return; }
    if (!subject)      { showToast("Subject is required.", "warning"); return; }
    if (!body.trim())  { showToast("Email body cannot be empty.", "warning"); return; }

    const isUploading = attachments.some((att) => att.progress < 100 && !att.error);
    if (isUploading) {
      showToast("Please wait for all attachments to finish uploading.", "warning");
      return;
    }

    const hasUploadErrors = attachments.some((att) => att.error !== null);
    if (hasUploadErrors) {
      showToast("Some attachments failed to upload. Please remove or retry them before sending.", "error");
      return;
    }

    const uploadedAttachments = attachments
      .filter((att) => att.progress === 100 && !att.error && att.storeName)
      .map((att) => ({
        storeName: att.storeName,
        attachmentName: att.attachmentName,
        attachmentPath: att.attachmentPath,
      }));

    if (uploadedAttachments.length < attachments.length) {
      showToast("Not all attachments have uploaded successfully.", "error");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          cc,
          bcc,
          subject,
          content: body,
          fromName: (user as any)?.name,
          employeeId: (user as any)?.id,
          attachments: uploadedAttachments,
        }),
      });

      let data: any = {};
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(text || "Server returned non-JSON response");
      }

      if (res.ok) {
        showToast("Email sent successfully.", "success");
        // Clear persisted draft + AI panel so compose starts fresh next time
        try { localStorage.removeItem(LS_DRAFT); localStorage.removeItem(LS_AI); } catch {}

        // Broadcast real-time notifications for each recipient
        if (data.recipients && Array.isArray(data.recipients)) {
          const channelsToNotify = ["mail_realtime_sidebar", "mail_realtime_inbox", "mail_realtime_kanban", "mail_realtime_sent"];
          channelsToNotify.forEach((chanName) => {
            const channel = supabase.channel(chanName);
            channel.subscribe((status) => {
              if (status === "SUBSCRIBED") {
                data.recipients.forEach((rec: any) => {
                  channel.send({
                    type: "broadcast",
                    event: "new_mail",
                    payload: {
                      id: rec.id,
                      employee_id: rec.employee_id,
                      sender_name: (user as any)?.name || "NexaWork",
                      subject: subject,
                      is_internal: rec.is_internal,
                    },
                  });
                });
                setTimeout(() => {
                  supabase.removeChannel(channel);
                }, 1000);
              }
            });
          });
        }

        setTo([]); setCc([]); setBcc([]); setSubject(""); setBody("");
        setAttachments([]);
      } else {
        showToast(data.error || "Failed to send.", "error");
      }
    } catch (e: any) {
      console.error("Failed to send email:", e);
      showToast(e.message || "An error occurred while sending.", "error");
    } finally {
      setSending(false);
    }
  }

  const CATEGORY_COLORS: Record<string, string> = {
    hr: "bg-sky-500/10 text-sky-500", finance: "bg-amber-500/10 text-amber-500",
    general: "bg-theme-raised text-theme-muted", ops: "bg-emerald-500/10 text-emerald-500",
    sales: "bg-rose-500/10 text-rose-500",
  };

  return (
    <DashboardShell
      moduleKey="mail_compose"
      title="Compose Email"
      subtitle="Write and send emails with AI assist."
      actions={
        <div className="flex items-center gap-2">
          <button onClick={saveDraft} disabled={saving}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-theme-border bg-theme-raised text-xs font-semibold text-theme-muted hover:text-theme-fg transition-all">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
            Save Draft
          </button>
          <button onClick={handleSend} disabled={sending}
            className="flex items-center gap-1.5 h-9 px-5 rounded-xl bg-theme-primary text-white text-xs font-bold hover:bg-theme-primary/90 transition-all shadow-sm disabled:opacity-60">
            {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Send
          </button>
        </div>
      }
    >
      <div className="flex gap-5">
        {/* Compose Panel */}
        <div className="flex-1 min-w-0 page-card p-0 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-1 px-4 py-2.5 border-b border-theme-border bg-theme-raised/30">
            {[
              { icon: Bold,   label: "Bold",   action: () => insertFormat("bold") },
              { icon: Italic, label: "Italic", action: () => insertFormat("italic") },
              { icon: Link,   label: "Link",   action: () => insertFormat("link") },
              { icon: List,   label: "List",   action: () => insertFormat("list") },
            ].map(({ icon: Icon, label, action }) => (
              <button key={label} onClick={action} title={label}
                className="p-1.5 rounded-lg text-theme-muted hover:text-theme-fg hover:bg-theme-raised transition-all">
                <Icon size={13} />
              </button>
            ))}
            <div className="h-4 w-px bg-theme-border mx-1" />
            <button onClick={() => setShowTemplates(!showTemplates)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-theme-muted hover:text-theme-fg hover:bg-theme-raised text-[11px] font-semibold transition-all">
              <Layers size={12} /> Templates
            </button>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => aiImprove("improve_tone")} disabled={aiLoading}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-theme-primary/10 text-theme-primary text-[11px] font-semibold hover:bg-theme-primary/20 transition-all disabled:opacity-50">
                {aiLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                Improve
              </button>
              <button onClick={() => aiImprove("shorten")} disabled={aiLoading}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-theme-primary/10 text-theme-primary text-[11px] font-semibold hover:bg-theme-primary/20 transition-all disabled:opacity-50">
                <Minus size={11} /> Shorten
              </button>
            </div>
          </div>

          {/* Template Picker */}
          {showTemplates && (
            <div className="border-b border-theme-border bg-theme-page px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-theme-fg">Choose a Template</p>
                <button onClick={() => setShowTemplates(false)} className="text-theme-muted hover:text-theme-fg"><X size={13} /></button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {templates.map((t) => (
                  <button key={t.id} onClick={() => applyTemplate(t)}
                    className="flex items-start gap-2 p-3 rounded-xl border border-theme-border hover:border-theme-primary/30 hover:bg-theme-raised text-left transition-all group">
                    <FileText size={13} className="text-theme-muted mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-theme-fg truncate">{t.name}</p>
                      <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-full", CATEGORY_COLORS[t.category] || "bg-theme-raised text-theme-muted")}>
                        {t.category}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Fields */}
          <div className="divide-y divide-theme-border/50">
            {/* To */}
            <div className="flex items-start px-4 py-2.5 gap-3 relative">
              <span className="text-[11px] font-bold text-theme-muted mt-2 w-8 flex-shrink-0">To</span>
              <div className="flex-1 flex flex-wrap gap-1 items-center min-h-[32px]">
                {to.map((email) => (
                  <span key={email} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-theme-primary/10 text-theme-primary text-[11px] font-semibold">
                    {email} <button onClick={() => removeTag(to, setTo, email)}><X size={9} /></button>
                  </span>
                ))}
                <input
                  value={toInput}
                  onChange={(e) => { setToInput(e.target.value); setActiveInput("to"); searchEmployees(e.target.value); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(to, setTo, setToInput, toInput); }}}
                  onBlur={() => { setTimeout(() => { addTag(to, setTo, setToInput, toInput); setActiveInput(null); }, 200); }}
                  placeholder={to.length === 0 ? "Add recipients…" : ""}
                  className="flex-1 min-w-32 bg-transparent text-xs text-theme-fg outline-none placeholder:text-theme-muted/50 h-8"
                />
              </div>
              <button onClick={() => setShowCcBcc(!showCcBcc)}
                className="text-[10px] font-semibold text-theme-muted hover:text-theme-fg transition-colors mt-2">
                {showCcBcc ? "Hide" : "CC/BCC"}
              </button>
              {activeInput === "to" && employeeSuggestions.length > 0 && (
                <div className="absolute left-14 top-full z-50 w-72 rounded-xl border border-theme-border bg-theme-surface shadow-xl overflow-hidden">
                  {employeeSuggestions.map((emp) => (
                    <button key={emp.id} onMouseDown={() => addTag(to, setTo, setToInput, emp.email)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-theme-raised text-left transition-all">
                      <div className="h-6 w-6 rounded-full bg-theme-primary/10 flex items-center justify-center text-[9px] font-black text-theme-primary">
                        {emp.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-theme-fg">{emp.name}</p>
                        <p className="text-[10px] text-theme-muted">{emp.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* CC / BCC */}
            {showCcBcc && (
              <>
                {[
                  { label: "CC",  list: cc,  setList: setCc,  input: ccInput,  setInput: setCcInput,  inputKey: "cc" as const },
                  { label: "BCC", list: bcc, setList: setBcc, input: bccInput, setInput: setBccInput, inputKey: "bcc" as const },
                ].map(({ label, list, setList, input, setInput, inputKey }) => (
                  <div key={label} className="flex items-start px-4 py-2 gap-3 relative">
                    <span className="text-[11px] font-bold text-theme-muted mt-2 w-8 flex-shrink-0">{label}</span>
                    <div className="flex-1 flex flex-wrap gap-1 items-center min-h-[28px]">
                      {list.map((email) => (
                        <span key={email} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-theme-raised text-theme-muted text-[11px]">
                          {email} <button onClick={() => removeTag(list, setList, email)}><X size={9} /></button>
                        </span>
                      ))}
                      <input
                        value={input}
                        onChange={(e) => { setInput(e.target.value); setActiveInput(inputKey); searchEmployees(e.target.value); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(list, setList, setInput, input); }}}
                        onBlur={() => { setTimeout(() => { addTag(list, setList, setInput, input); setActiveInput(null); }, 200); }}
                        placeholder={`Add ${label} recipients…`}
                        className="flex-1 min-w-32 bg-transparent text-xs text-theme-fg outline-none placeholder:text-theme-muted/50 h-7"
                      />
                    </div>
                    {activeInput === inputKey && employeeSuggestions.length > 0 && (
                      <div className="absolute left-14 top-full z-50 w-72 rounded-xl border border-theme-border bg-theme-surface shadow-xl overflow-hidden">
                        {employeeSuggestions.map((emp) => (
                          <button key={emp.id} onMouseDown={() => addTag(list, setList, setInput, emp.email)}
                            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-theme-raised text-left">
                            <p className="text-xs font-semibold text-theme-fg">{emp.name}</p>
                            <p className="text-[10px] text-theme-muted ml-2">{emp.email}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* Subject */}
            <div className="flex items-center px-4 py-2.5 gap-3">
              <span className="text-[11px] font-bold text-theme-muted w-16 flex-shrink-0">Subject</span>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter subject…"
                className="flex-1 bg-transparent text-sm font-semibold text-theme-fg outline-none placeholder:text-theme-muted/40"
              />
              {suggestedSubject && (
                <button onClick={() => { setSubject(suggestedSubject); setSuggestedSubject(""); }}
                  className="text-[10px] text-theme-primary hover:underline flex-shrink-0">
                  Use: {suggestedSubject.slice(0, 30)}…
                </button>
              )}
              <button onClick={() => aiImprove("suggest_subject")} disabled={aiLoading}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-theme-raised text-theme-muted hover:text-theme-fg text-[10px] font-semibold transition-all">
                <Bot size={10} /> AI
              </button>
            </div>
          </div>

          {/* Body — shared wrapper holds both editing modes and the @-mention popup */}
          <div className="relative">
            {isHtmlBody && !showSource ? (
              <>
                <div
                  ref={htmlBodyRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={() => {
                    if (htmlBodyRef.current) {
                      const html = htmlBodyRef.current.innerHTML;
                      lastSetBody.current = html;
                      setBody(html);
                      // @-mention detection inside contentEditable
                      const sel = window.getSelection();
                      if (sel && sel.rangeCount > 0) {
                        const range = sel.getRangeAt(0);
                        const node  = range.startContainer;
                        if (node.nodeType === Node.TEXT_NODE) {
                          const text   = node.textContent || "";
                          const offset = range.startOffset;
                          let atIdx = -1;
                          for (let i = offset - 1; i >= Math.max(0, offset - 60); i--) {
                            const ch = text[i];
                            if (ch === "@") { atIdx = i; break; }
                            if (ch === " " || ch === "\n" || ch === " ") break;
                          }
                          setAtMention(atIdx >= 0 ? { query: text.slice(atIdx + 1, offset), start: atIdx } : null);
                        } else {
                          setAtMention(null);
                        }
                      }
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setAtMention(null); } }}
                  className="w-full px-4 py-4 text-sm text-theme-fg leading-relaxed outline-none cursor-text"
                  style={{ minHeight: 320 }}
                />
                <div className="absolute top-3 right-3 pointer-events-none">
                  <span className="text-[9px] text-theme-muted/50 font-medium select-none">Click to edit · type @ to attach</span>
                </div>
              </>
            ) : (
              <>
                <textarea
                  ref={textareaRef}
                  value={body}
                  onChange={handleBodyChange}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { e.preventDefault(); setAtMention(null); }
                  }}
                  placeholder={"Write your email here…\n\nTip: Type @ to attach a file from File Share. Use AI buttons above to improve tone or shorten."}
                  className="w-full flex-1 px-4 py-4 text-sm text-theme-fg bg-transparent resize-none outline-none placeholder:text-theme-muted/40 leading-relaxed"
                  style={{ minHeight: 320 }}
                />
              </>
            )}

            {/* ── @-file mention popup — works for both plain and HTML modes ── */}
            {atMention !== null && (() => {
              const results = filePickerFiles
                .filter(f => atMention.query === "" || f.filename.toLowerCase().includes(atMention.query.toLowerCase()))
                .slice(0, 7);
              if (!results.length && atMention.query.length < 1) return null;
              return (
                <div className="absolute bottom-4 left-4 z-50 w-72 rounded-2xl border border-theme-border bg-theme-surface shadow-2xl overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center gap-2 px-3 py-2.5 border-b border-theme-border/60 bg-theme-raised/60">
                    <div className="h-5 w-5 rounded-md bg-theme-primary/10 flex items-center justify-center">
                      <AtSign size={10} className="text-theme-primary" />
                    </div>
                    <span className="text-[10px] font-bold text-theme-muted uppercase tracking-widest flex-1">File Share</span>
                    {atMention.query && (
                      <span className="text-[10px] font-semibold text-theme-primary bg-theme-primary/10 px-1.5 py-0.5 rounded-md">
                        {atMention.query}
                      </span>
                    )}
                  </div>

                  {/* File list */}
                  {results.length > 0 ? (
                    <div className="max-h-52 overflow-y-auto">
                      {results.map(f => (
                        <button
                          key={f.id}
                          onMouseDown={e => { e.preventDefault(); pickMentionFile(f); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-theme-raised text-left transition-all border-b border-theme-border/20 last:border-0 group"
                        >
                          <div className={cn(
                            "h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0",
                            f.file_type?.includes("pdf")          ? "bg-rose-500/10"     :
                            f.file_type?.includes("word")         ? "bg-blue-500/10"     :
                            f.file_type?.includes("sheet")        ? "bg-emerald-500/10"  :
                            f.file_type?.startsWith("image/")     ? "bg-purple-500/10"   :
                            "bg-theme-raised border border-theme-border"
                          )}>
                            <FileText size={12} className={cn(
                              f.file_type?.includes("pdf")        ? "text-rose-500"     :
                              f.file_type?.includes("word")       ? "text-blue-500"     :
                              f.file_type?.includes("sheet")      ? "text-emerald-500"  :
                              f.file_type?.startsWith("image/")   ? "text-purple-500"   :
                              "text-theme-muted"
                            )} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-theme-fg truncate">{f.filename}</p>
                            <p className="text-[10px] text-theme-muted">
                            {formatFileSize(f.file_size)} · {f.source === "email" ? "Mail" : "Uploaded"}
                          </p>
                          </div>
                          {attachingMentionId === f.id
                            ? <Loader2 size={11} className="text-theme-primary animate-spin flex-shrink-0" />
                            : <Paperclip size={10} className="text-theme-muted group-hover:text-theme-primary flex-shrink-0 transition-colors" />
                          }
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 py-5 text-theme-muted">
                      <Search size={18} className="opacity-30" />
                      <p className="text-xs font-semibold">No files matching "{atMention.query}"</p>
                      <p className="text-[10px] opacity-60">Upload files in File Share first</p>
                    </div>
                  )}

                  {/* Footer hint */}
                  <div className="px-3 py-2 bg-theme-raised/40 border-t border-theme-border/50 flex items-center gap-1.5">
                    <span className="text-[9px] text-theme-muted">Click to insert bold mention + auto-attach</span>
                    <kbd className="ml-auto bg-theme-border/60 text-theme-muted text-[8px] px-1.5 py-0.5 rounded font-mono">Esc</kbd>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Attachments List */}
          {attachments.length > 0 && (
            <div className="border-t border-theme-border/50 bg-theme-raised/10 px-4 py-3 space-y-2">
              {attachments.map((file) => (
                <div key={file.id} className="flex items-center justify-between p-2 rounded-xl bg-theme-surface border border-theme-border/50">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileText size={16} className="text-theme-muted flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold text-theme-fg truncate">{file.name}</span>
                        <span className="text-[10px] text-theme-muted flex-shrink-0">({formatFileSize(file.size)})</span>
                      </div>
                      {file.progress < 100 && !file.error && (
                        <div className="w-full bg-theme-border/30 rounded-full h-1 mt-1.5 overflow-hidden">
                          <div 
                            className="bg-theme-primary h-1 rounded-full transition-all duration-300" 
                            style={{ width: `${file.progress}%` }} 
                          />
                        </div>
                      )}
                      {file.error && (
                        <p className="text-[10px] text-red-500 font-medium mt-0.5">{file.error}</p>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={() => removeAttachment(file.id)} 
                    className="p-1 rounded-lg text-theme-muted hover:text-theme-fg hover:bg-theme-raised transition-all ml-4"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-theme-border bg-theme-raised/20">
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-theme-border text-theme-muted hover:text-theme-fg cursor-pointer text-xs font-semibold transition-all">
              <Paperclip size={13} /> Attach File
              <input type="file" multiple className="hidden" onChange={handleFileChange} />
            </label>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={saveDraft} disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-theme-border text-theme-muted hover:text-theme-fg text-xs font-semibold transition-all">
                {saving ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />} Draft
              </button>
              <button onClick={handleSend} disabled={sending}
                className="flex items-center gap-1.5 px-5 py-1.5 rounded-xl bg-theme-primary text-white text-xs font-bold hover:bg-theme-primary/90 transition-all disabled:opacity-60 shadow-sm">
                {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* ── AI Agent Panel — fixed right side, chatbot-style, non-blocking ── */}
      {/* Persists across refresh and navigation via localStorage              */}
      <style>{`
        @keyframes ai-progress-slide {
          0%   { transform: translateX(-120%); }
          50%  { transform: translateX(180%); }
          100% { transform: translateX(-120%); }
        }
        @keyframes ai-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-5px); }
        }
        @keyframes ai-panel-in {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {(aiLoading || (aiPanel && improvedBody)) && (
        <div
          className="fixed right-5 z-50 w-[300px] rounded-2xl shadow-2xl border border-theme-border/70 bg-theme-surface flex flex-col overflow-hidden"
          style={{ top: 72, bottom: 20, maxHeight: "calc(100vh - 92px)", animation: "ai-panel-in 0.25s ease-out" }}
        >
          {/* ── Header ── */}
          <div className="flex items-center gap-2.5 px-4 py-3 bg-theme-raised/40 border-b border-theme-border/50 flex-shrink-0">
            <div className="h-6 w-6 rounded-lg bg-theme-primary/15 flex items-center justify-center flex-shrink-0">
              <Wand2
                size={12}
                className="text-theme-primary"
                style={aiLoading ? { animation: "ai-float 2s ease-in-out infinite" } : undefined}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-theme-fg leading-none truncate">
                {aiLoading
                  ? (aiAction === "shorten" ? "Condensing…" : "Polishing…")
                  : (aiAction === "shorten" ? "Shortened" : "Improved") + " — Ready"}
              </p>
              <p className="text-[9px] text-theme-muted mt-0.5">
                {aiLoading ? "You can keep working — result saves here" : "Tap Apply to use it"}
              </p>
            </div>
            {!aiLoading && (
              <button
                onClick={dismissAiPanel}
                className="text-theme-muted hover:text-theme-fg p-0.5 rounded transition-colors flex-shrink-0"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* ── Loading / scanning state ── */}
          {aiLoading && (
            <div className="flex-1 px-5 py-6 flex flex-col items-center justify-center gap-5 overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-b from-theme-primary/3 to-transparent pointer-events-none" />

              {/* Animated icon */}
              <div className="relative z-10">
                <div
                  className="h-12 w-12 rounded-xl bg-gradient-to-br from-theme-primary/20 to-indigo-500/20 border border-theme-primary/20 flex items-center justify-center"
                  style={{ animation: "ai-float 2s ease-in-out infinite" }}
                >
                  <Wand2 size={20} className="text-theme-primary" />
                </div>
                <div className="absolute -inset-1.5 rounded-2xl border border-theme-primary/15 animate-ping" />
              </div>

              {/* Status */}
              <div className="text-center z-10">
                <p className="text-xs font-semibold text-theme-fg">
                  {aiAction === "shorten" ? "Cutting filler words…" : "Polishing your email…"}
                </p>
                <p className="text-[10px] text-theme-muted mt-1 leading-snug">
                  ~10–15 seconds.<br />You can browse other sections.
                </p>
              </div>

              {/* Skeleton lines */}
              <div className="w-full z-10 space-y-2 opacity-60">
                {[88, 70, 95, 60, 82, 50].map((w, i) => (
                  <div
                    key={i}
                    className="h-2 rounded-full bg-theme-primary/20 animate-pulse"
                    style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </div>

              {/* Indeterminate progress */}
              <div className="w-full h-0.5 bg-theme-border/30 rounded-full overflow-hidden z-10">
                <div
                  className="h-full w-2/5 bg-gradient-to-r from-theme-primary/40 via-theme-primary to-theme-primary/40 rounded-full"
                  style={{ animation: "ai-progress-slide 1.6s ease-in-out infinite" }}
                />
              </div>
            </div>
          )}

          {/* ── Result state ── */}
          {!aiLoading && improvedBody && (
            <>
              {/* New subject if AI suggested one */}
              {improvedSubject && improvedSubject !== subject && (
                <div className="px-4 py-2.5 border-b border-theme-border/40 bg-theme-primary/5 flex-shrink-0">
                  <p className="text-[9px] font-bold text-theme-muted uppercase tracking-widest mb-1">New Subject</p>
                  <p className="text-[11px] font-semibold text-theme-fg leading-snug line-clamp-2">
                    {improvedSubject}
                  </p>
                </div>
              )}

              {/* Scrollable preview */}
              <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3">
                {improvedIsHtml ? (
                  <div className="text-xs leading-relaxed" dangerouslySetInnerHTML={{ __html: improvedBody }} />
                ) : (
                  <p className="text-xs text-theme-muted leading-relaxed whitespace-pre-wrap">{improvedBody}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 px-4 py-3 border-t border-theme-border/40 bg-theme-raised/30 flex-shrink-0">
                <Button className="flex-1 h-8 text-xs gap-1.5 font-bold" onClick={applyAiSuggestion}>
                  <Check size={11} /> Apply
                </Button>
                <Button variant="outline" className="flex-1 h-8 text-xs font-semibold" onClick={dismissAiPanel}>
                  Discard
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
