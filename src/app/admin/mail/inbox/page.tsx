"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useState, useEffect, useCallback, useRef } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/layout/AuthProvider";
import { useToast } from "@/components/ui/ToastLegacy";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  Inbox, Send, FileText, Star, StarOff, Trash2, RefreshCw, Search,
  Paperclip, PenLine, Reply, Forward, Bot, Sparkles, Loader2,
  ChevronRight, Mail, MailOpen, Clock, AlertTriangle, Briefcase,
  IndianRupee, RotateCcw, X, Copy, Check, Download, Eye, Table2, Image,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

type MailMessage = {
  id: string;
  zoho_message_id: string;
  subject: string;
  from_name: string;
  from_address: string;
  to_address: string[];
  cc_address: string[];
  preview: string;
  body: string;
  received_at: string;
  is_read: boolean;
  is_starred: boolean;
  has_attachment: boolean;
  ai_category: string;
  ai_priority: number;
  ai_sentiment: string;
  ai_summary: string;
  folder: string;
};

const FOLDERS = [
  { id: "Inbox",   label: "Inbox",   icon: Inbox },
  { id: "Sent",    label: "Sent",    icon: Send },
  { id: "Drafts",  label: "Drafts",  icon: FileText },
  { id: "Starred", label: "Starred", icon: Star },
  { id: "Trash",   label: "Trash",   icon: Trash2 },
];

const AI_LABELS = [
  { id: "URGENT",    label: "Urgent",     color: "text-rose-500",    dot: "bg-rose-500"    },
  { id: "WORK",      label: "Work",       color: "text-blue-500",    dot: "bg-blue-500"    },
  { id: "FINANCE",   label: "Finance",    color: "text-amber-500",   dot: "bg-amber-500"   },
  { id: "FOLLOW_UP", label: "Follow-Up",  color: "text-purple-500",  dot: "bg-purple-500"  },
];

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  URGENT: AlertTriangle, WORK: Briefcase, FINANCE: IndianRupee, FOLLOW_UP: RotateCcw, GENERAL: Mail,
};

const SENTIMENT_COLORS: Record<string, string> = {
  POSITIVE: "border-l-emerald-400",
  NEGATIVE: "border-l-rose-400",
  NEUTRAL:  "border-l-theme-border",
};

function getInitials(name: string) {
  return (name || "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function AICategoryBadge({ category }: { category: string }) {
  const map: Record<string, string> = {
    URGENT: "bg-rose-500/10 text-rose-500",
    WORK: "bg-blue-500/10 text-blue-500",
    FINANCE: "bg-amber-500/10 text-amber-600",
    FOLLOW_UP: "bg-purple-500/10 text-purple-500",
    GENERAL: "bg-theme-raised text-theme-muted",
  };
  return (
    <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-full", map[category] || map.GENERAL)}>
      {(category || "GENERAL").replace("_", " ")}
    </span>
  );
}

function MailScopeBadge({ msg, size = "small" }: { msg: any; size?: "small" | "large" }) {
  // No hardcoded company domain here — this is a client component and can't
  // read the server-only ZOHO_MAIL_DOMAIN config; left empty rather than
  // guessing, so this badge simply doesn't mark anything "company" until a
  // public config source for the mail domain is introduced.
  const companyDomains: string[] = [];
  
  const isCompanyEmail = (email: string) => {
    if (!email) return false;
    const clean = email.toLowerCase().trim();
    return companyDomains.some(domain => clean.endsWith(`@${domain}`) || clean.endsWith(`.${domain}`));
  };

  const fromAddress = msg.from_address || "";
  
  let recipients: string[] = [];
  if (Array.isArray(msg.to_address)) {
    recipients = msg.to_address;
  } else if (typeof msg.to_address === "string") {
    recipients = msg.to_address.split(",").map((e: string) => e.trim());
  }

  const isFromCompany = isCompanyEmail(fromAddress);
  const isAllToCompany = recipients.length > 0 && recipients.every(email => isCompanyEmail(email));
  const isInternal = isFromCompany && isAllToCompany;

  if (isInternal) {
    return (
      <span className={cn(
        "font-black uppercase tracking-wider rounded-md border",
        size === "large" 
          ? "px-2.5 py-1 text-[11px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
          : "px-1.5 py-0.5 text-[8px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
      )}>
        Internal
      </span>
    );
  } else {
    return (
      <span className={cn(
        "font-black uppercase tracking-wider rounded-md border",
        size === "large" 
          ? "px-2.5 py-1 text-[11px] bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/40 shadow-sm animate-pulse"
          : "px-1.5 py-0.5 text-[8px] bg-rose-500/15 text-rose-500 border-rose-500/25"
      )}>
        External
      </span>
    );
  }
}

export default function InboxPage() {
  const { user }       = useAuth();
  const { showToast }  = useToast();

  const [folder,   setFolder]   = useState("Inbox");
  const [aiFilter, setAiFilter] = useState<string | null>(null);
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [selected, setSelected] = useState<MailMessage | null>(null);
  const [search,   setSearch]   = useState("");
  const [loading,  setLoading]  = useState(true);
  const [syncing,  setSyncing]  = useState(false);
  const [connected, setConnected] = useState(true);

  const [aiLoading,       setAiLoading]       = useState(false);
  const [replySuggestions, setReplySuggestions] = useState<string[]>([]);
  const [copiedIdx,        setCopiedIdx]        = useState<number | null>(null);

  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyAttachments, setReplyAttachments] = useState<{
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

  const [threadMessages, setThreadMessages] = useState<MailMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [expandedMsgs, setExpandedMsgs] = useState<Record<string, boolean>>({});

  async function toggleMessageExpanded(msgId: string) {
    const isNowExpanded = !expandedMsgs[msgId];
    setExpandedMsgs((prev) => ({ ...prev, [msgId]: isNowExpanded }));

    if (isNowExpanded) {
      const targetMsg = threadMessages.find((m) => m.id === msgId);
      if (targetMsg && !targetMsg.body) {
        try {
          const res = await fetch(`/api/mail/inbox?detail_id=${msgId}${user?.id ? `&employee_id=${user.id}` : ""}`);
          const data = await res.json();
          if (data.success && data.message) {
            setThreadMessages((prev) => prev.map((m) => m.id === msgId ? data.message : m));
          }
        } catch (e) {
          console.error("Failed to lazy-load message details:", e);
        }
      }
    }
  }

  function formatBytes(bytes: number) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function handleReplyFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      uploadReplyFile(file);
    });
    e.target.value = "";
  }

  function uploadReplyFile(file: File) {
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

    setReplyAttachments((prev) => [...prev, newAttachment]);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("employee_id", user?.id || "");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/mail/attachments", true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setReplyAttachments((prev) =>
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
            setReplyAttachments((prev) =>
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
          setReplyAttachments((prev) =>
            prev.map((att) => (att.id === id ? { ...att, error: "Invalid response from server" } : att))
          );
        }
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          setReplyAttachments((prev) =>
            prev.map((att) => (att.id === id ? { ...att, error: res.error || "Upload failed" } : att))
          );
        } catch {
          setReplyAttachments((prev) =>
            prev.map((att) => (att.id === id ? { ...att, error: "Upload failed" } : att))
          );
        }
      }
    };

    xhr.onerror = () => {
      setReplyAttachments((prev) =>
        prev.map((att) => (att.id === id ? { ...att, error: "Network error occurred" } : att))
      );
    };

    xhr.send(formData);

    setReplyAttachments((prev) =>
      prev.map((att) => (att.id === id ? { ...att, xhr } : att))
    );
  }

  function removeReplyAttachment(id: string) {
    setReplyAttachments((prev) => {
      const target = prev.find((att) => att.id === id);
      if (target && target.xhr) {
        target.xhr.abort();
      }
      return prev.filter((att) => att.id !== id);
    });
  }

  const handleReplyPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    let hasFiles = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file") {
        const file = items[i].getAsFile();
        if (file) {
          uploadReplyFile(file);
          hasFiles = true;
        }
      }
    }
    if (hasFiles) {
      e.preventDefault();
    }
  };

  const bodyRef        = useRef<HTMLDivElement>(null);
  const prevIdsRef     = useRef<Set<string>>(new Set());
  const isInitialRef   = useRef(true);

  const load = useCallback(async (sync = false) => {
    if (!user?.id) return; // Wait until employee user is hydrated
    if (sync) setSyncing(true); else setLoading(true);
    try {
      const url = `/api/mail/inbox?folder=${folder}${sync ? "&sync=true" : ""}&employee_id=${user.id}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConnected(data.connected !== false);
      setMessages(data.data || []);
    } catch (e) {
      console.error("Failed to load/sync inbox emails:", e);
    } finally {
      setLoading(false); setSyncing(false);
    }
  }, [folder, user?.id]);

  useEffect(() => { load(); }, [load]);

  // Intercept attachment clicks and open custom tabbed preview page
  useEffect(() => {
    const container = bodyRef.current;
    if (!container) return;
    const handler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;
      const href = target.getAttribute("href") || target.href || "";
      const isAttachmentUrl = href.includes("/api/mail/attachments/download") || href.includes("/api/mail/attachments?");
      if (!isAttachmentUrl) return;
      
      // Stop the native browser download and open the preview page in a new tab instead!
      e.preventDefault();
      e.stopPropagation();
      const previewUrl = href
        .replace("/api/mail/attachments/download", "/admin/mail/preview")
        .replace("/api/mail/attachments", "/admin/mail/preview");
      window.open(previewUrl, "_blank");
    };
    container.addEventListener("click", handler);
    return () => container.removeEventListener("click", handler);
  }, [selected?.id, selected?.body]);
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("mail_realtime_inbox")
      .on("broadcast", { event: "new_mail" }, (payload: any) => {
        if (payload.payload && payload.payload.employee_id === user.id) {
          load();
        }
      })
      .on("broadcast", { event: "mail_status_changed" }, (payload: any) => {
        if (payload.payload && payload.payload.employee_id === user.id) {
          load();
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "mail_messages" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, user?.id]);

  // Detect new unread emails and show a toast + browser notification
  useEffect(() => {
    if (folder !== "Inbox") return;
    const currentIds = new Set(messages.map(m => m.id));
    if (!isInitialRef.current && prevIdsRef.current.size > 0) {
      const newUnread = messages.filter(m => !m.is_read && !prevIdsRef.current.has(m.id));
      if (newUnread.length > 0) {
        const first = newUnread[0];
        const label = newUnread.length > 1
          ? `${newUnread.length} new emails arrived`
          : `New email from ${first.from_name || first.from_address}`;
        showToast(label, "info", () => setSelected(first));
        if (typeof Notification !== "undefined") {
          if (Notification.permission === "default") Notification.requestPermission();
          if (Notification.permission === "granted") {
            try {
              new Notification("New Email — NexaWork", {
                body: `${first.from_name || first.from_address}: ${first.subject || "(no subject)"}`,
                icon: "/favicon.ico",
              });
            } catch {}
          }
        }
      }
    }
    isInitialRef.current = false;
    prevIdsRef.current = currentIds;
  }, [messages, folder]);

  // Auto-poll: sync with Zoho every 30 s so external emails appear without manual Sync.
  // The postgres_changes Realtime fires after insert and updates the inbox immediately.
  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(() => { load(true); }, 30_000);
    return () => clearInterval(interval);
  }, [load, user?.id]);

  async function selectMessage(msg: MailMessage) {
    // Abort pending reply attachment uploads and clear state
    replyAttachments.forEach((att) => {
      if (att.xhr) att.xhr.abort();
    });
    setReplyAttachments([]);

    setSelected(msg);
    setReplyOpen(false);
    setReplyBody("");
    setReplySuggestions([]);

    // Fetch all thread messages belonging to this root subject
    setThreadLoading(true);
    let matchedMsgs: MailMessage[] = [msg];
    try {
      const cleanSubject = msg.subject
        ? msg.subject.replace(/^(Re|Fwd|Fw|RE|FWD):\s*/i, "").trim()
        : "";
      const { data: dbMsgs } = await supabase
        .from("mail_messages")
        .select("*")
        .eq("employee_id", user?.id)
        .ilike("subject", `%${cleanSubject}%`)
        .order("received_at", { ascending: true });

      const cleanSubjectLower = cleanSubject.toLowerCase();
      matchedMsgs = (dbMsgs || []).filter((m) => {
        const mClean = m.subject
          ? m.subject.replace(/^(Re|Fwd|Fw|RE|FWD):\s*/i, "").trim().toLowerCase()
          : "";
        return mClean === cleanSubjectLower;
      });

      if (matchedMsgs.length === 0) {
        matchedMsgs = [msg];
      }
    } catch (e) {
      console.error("Failed to fetch thread messages:", e);
    } finally {
      setThreadLoading(false);
      setThreadMessages(matchedMsgs);

      // Initialize expandedMsgs record: expand latest message, and expand any unread message, or the current selected message
      const initialExpanded: Record<string, boolean> = {};
      matchedMsgs.forEach((m, idx) => {
        initialExpanded[m.id] = idx === matchedMsgs.length - 1 || !m.is_read || m.id === msg.id;
      });
      setExpandedMsgs(initialExpanded);
    }

    let currentBody = msg.body || msg.preview || "";

    // Asynchronously fetch full body content and attachments list
    try {
      const res = await fetch(`/api/mail/inbox?detail_id=${msg.id}${user?.id ? `&employee_id=${user.id}` : ""}`);
      const data = await res.json();
      if (data.success && data.message) {
        setSelected(data.message);
        setMessages((prev) => prev.map((m) => m.id === msg.id ? data.message : m));
        setThreadMessages((prev) => prev.map((m) => m.id === msg.id ? data.message : m));
        if (data.message.body) {
          currentBody = data.message.body;
        }
      }
    } catch (e) {
      console.error("Failed to load message details:", e);
    }

    if (!msg.is_read) {
      try {
        await fetch("/api/mail/inbox", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: msg.id, is_read: true }),
        });
      } catch (e) {
        console.error("Failed to mark message as read:", e);
      }
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, is_read: true } : m));
      setThreadMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, is_read: true } : m));
      
      // Broadcast status change to update unread count badges
      const statusChannels = ["mail_realtime_sidebar", "mail_realtime_inbox", "mail_realtime_kanban", "mail_realtime_sent"];
      statusChannels.forEach((chanName) => {
        const statusChannel = supabase.channel(chanName);
        statusChannel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            statusChannel.send({
              type: "broadcast",
              event: "mail_status_changed",
              payload: { employee_id: user?.id },
            });
            setTimeout(() => supabase.removeChannel(statusChannel), 1000);
          }
        });
      });
    }

    // Trigger AI classify if not done
    if (!msg.ai_summary && msg.zoho_message_id) {
      setAiLoading(true);
      try {
        const res = await fetch("/api/mail/ai/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type:      "classify",
            messageId: msg.zoho_message_id,
            subject:   msg.subject,
            preview:   msg.preview,
            fromName:  msg.from_name,
            body:      currentBody,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ai = await res.json();
        setSelected((prev) => prev ? { ...prev, ai_summary: ai.summary, ai_category: ai.category, ai_sentiment: ai.sentiment } : prev);
        setReplySuggestions(ai.replySuggestions || []);
      } catch (err) {
        console.error("Failed to fetch AI classification:", err);
      } finally {
        setAiLoading(false);
      }
    } else if (msg.ai_summary) {
      // Fetch reply suggestions
      setAiLoading(true);
      try {
        const res = await fetch("/api/mail/ai/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "reply_suggest",
            messageId: msg.zoho_message_id,
            subject: msg.subject,
            body: currentBody,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setReplySuggestions(data.suggestions || []);
      } catch (err) {
        console.error("Failed to fetch AI reply suggestions:", err);
      } finally {
        setAiLoading(false);
      }
    }
  }

  // Automatically refresh the conversation thread view when messages list updates (e.g. new mail sync, reply sent, etc.)
  useEffect(() => {
    if (!selected || !user?.id) return;

    const refreshThread = async () => {
      try {
        const cleanSubject = selected.subject
          ? selected.subject.replace(/^(Re|Fwd|Fw|RE|FWD):\s*/i, "").trim()
          : "";
        const { data: dbMsgs } = await supabase
          .from("mail_messages")
          .select("*")
          .eq("employee_id", user?.id)
          .ilike("subject", `%${cleanSubject}%`)
          .order("received_at", { ascending: true });

        const cleanSubjectLower = cleanSubject.toLowerCase();
        const matchedMsgs = (dbMsgs || []).filter((m) => {
          const mClean = m.subject
            ? m.subject.replace(/^(Re|Fwd|Fw|RE|FWD):\s*/i, "").trim().toLowerCase()
            : "";
          return mClean === cleanSubjectLower;
        });

        if (matchedMsgs.length > 0) {
          setThreadMessages(matchedMsgs);
          // Auto-expand any unread messages or the latest message
          setExpandedMsgs((prev) => {
            const updated = { ...prev };
            matchedMsgs.forEach((m, idx) => {
              if (updated[m.id] === undefined) {
                updated[m.id] = idx === matchedMsgs.length - 1 || !m.is_read;
              }
            });
            return updated;
          });
        }
      } catch (e) {
        console.error("Failed to refresh thread messages:", e);
      }
    };

    refreshThread();
  }, [messages, selected?.id, user?.id]);

  // Handle auto-selection of email when redirected via desktop notifications (select_id URL param)
  useEffect(() => {
    if (typeof window === "undefined" || !user?.id) return;
    const params = new URLSearchParams(window.location.search);
    const selectId = params.get("select_id");
    if (!selectId) return;

    const found = messages.find((m) => m.id === selectId);
    if (found) {
      if (selected?.id !== selectId) {
        selectMessage(found);
        // Clear parameter from URL
        const newUrl = window.location.pathname + (params.get("folder") ? `?folder=${params.get("folder")}` : "");
        window.history.replaceState({ ...window.history.state }, "", newUrl);
      }
    } else if (!loading) {
      // If messages are loaded but the selectId is not in the list, fetch it specifically
      const fetchAndSelect = async () => {
        try {
          const res = await fetch(`/api/mail/inbox?detail_id=${selectId}&employee_id=${user.id}`);
          const data = await res.json();
          if (data.success && data.message) {
            const newMsg = data.message;
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [newMsg, ...prev];
            });
            selectMessage(newMsg);
            // Clear parameter from URL
            const newUrl = window.location.pathname + (params.get("folder") ? `?folder=${params.get("folder")}` : "");
            window.history.replaceState({ ...window.history.state }, "", newUrl);
          }
        } catch (e) {
          console.error("Error auto-selecting message from URL param:", e);
        }
      };
      fetchAndSelect();
    }
  }, [messages, loading, selected?.id, user?.id]);

  async function toggleStar(msg: MailMessage, e: React.MouseEvent) {
    e.stopPropagation(); e.preventDefault();
    try {
      await fetch("/api/mail/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: msg.id, is_starred: !msg.is_starred }),
      });
    } catch (e) {
      console.error("Failed to toggle star:", e);
    }
    setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, is_starred: !m.is_starred } : m));
    if (selected?.id === msg.id) setSelected((s) => s ? { ...s, is_starred: !s.is_starred } : s);

    // Broadcast status change to update unread count badges
    const statusChannels = ["mail_realtime_sidebar", "mail_realtime_inbox", "mail_realtime_kanban", "mail_realtime_sent"];
    statusChannels.forEach((chanName) => {
      const statusChannel = supabase.channel(chanName);
      statusChannel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          statusChannel.send({
            type: "broadcast",
            event: "mail_status_changed",
            payload: { employee_id: user?.id },
          });
          setTimeout(() => supabase.removeChannel(statusChannel), 1000);
        }
      });
    });
  }

  async function sendReply() {
    if ((!replyBody.trim() && replyAttachments.length === 0) || !selected) return;

    const isUploading = replyAttachments.some((att) => att.progress < 100 && !att.error);
    if (isUploading) {
      showToast("Please wait for all attachments to finish uploading.", "warning");
      return;
    }

    const hasUploadErrors = replyAttachments.some((att) => att.error !== null);
    if (hasUploadErrors) {
      showToast("Some attachments failed to upload. Please remove or retry them before sending.", "error");
      return;
    }

    const uploadedAttachments = replyAttachments
      .filter((att) => att.progress === 100 && !att.error && att.storeName)
      .map((att) => ({
        storeName: att.storeName,
        attachmentName: att.attachmentName,
        attachmentPath: att.attachmentPath,
      }));

    if (uploadedAttachments.length < replyAttachments.length) {
      showToast("Not all attachments have uploaded successfully.", "error");
      return;
    }

    setReplySending(true);
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to:      [selected.from_address],
          subject: `Re: ${selected.subject}`,
          content: replyBody,
          employeeId: user?.id,
          fromName: user?.name,
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
        showToast("Reply sent successfully.", "success");

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
                      sender_name: user?.name || "NexaWork",
                      subject: `Re: ${selected.subject}`,
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

        setReplyOpen(false);
        setReplyBody("");
        setReplyAttachments([]);
      } else {
        showToast(data.error || "Failed to send reply.", "error");
      }
    } catch (e: any) {
      console.error("Failed to send reply:", e);
      showToast(e.message || "An error occurred while sending reply.", "error");
    } finally {
      setReplySending(false);
    }
  }

  function copyReply(text: string, idx: number) {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setReplyBody(text);
    setReplyOpen(true);
    setTimeout(() => setCopiedIdx(null), 1500);
  }

  const displayed = messages.filter((m) => {
    const q = search.toLowerCase();
    const matchSearch = !q || m.subject?.toLowerCase().includes(q) || m.from_name?.toLowerCase().includes(q) || m.preview?.toLowerCase().includes(q);
    const matchAi     = !aiFilter || m.ai_category === aiFilter;
    const matchFolder = folder === "Starred" ? m.is_starred : true;
    return matchSearch && matchAi && matchFolder;
  });

  // Group displayed messages by root subject to form conversations
  const groupedThreads: { rootSubject: string; latestMessage: MailMessage; count: number; receivedCount: number; sentCount: number; unreadCount: number }[] = [];
  
  displayed.forEach((msg) => {
    const cleanSub = msg.subject
      ? msg.subject.replace(/^(Re|Fwd|Fw|RE|FWD):\s*/i, "").trim().toLowerCase()
      : "";
      
    const existing = groupedThreads.find((g) => g.rootSubject === cleanSub);
    if (existing) {
      existing.count += 1;
      if (msg.folder === "Inbox") existing.receivedCount += 1;
      if (msg.folder === "Sent") existing.sentCount += 1;
      if (!msg.is_read) {
        existing.unreadCount += 1;
      }
      // If this message is newer than the stored one, update the latest message
      if (new Date(msg.received_at) > new Date(existing.latestMessage.received_at)) {
        existing.latestMessage = msg;
      }
    } else {
      groupedThreads.push({
        rootSubject: cleanSub,
        latestMessage: msg,
        count: 1,
        receivedCount: msg.folder === "Inbox" ? 1 : 0,
        sentCount: msg.folder === "Sent" ? 1 : 0,
        unreadCount: msg.is_read ? 0 : 1,
      });
    }
  });

  // Sort threads by the received_at timestamp of their latest message
  groupedThreads.sort((a, b) => new Date(b.latestMessage.received_at).getTime() - new Date(a.latestMessage.received_at).getTime());

  const isSelectedThread = (msg: MailMessage) => {
    if (!selected) return false;
    const selSub = selected.subject ? selected.subject.replace(/^(Re|Fwd|Fw|RE|FWD):\s*/i, "").trim().toLowerCase() : "";
    const msgSub = msg.subject ? msg.subject.replace(/^(Re|Fwd|Fw|RE|FWD):\s*/i, "").trim().toLowerCase() : "";
    return selSub === msgSub;
  };

  return (
    <DashboardShell
      moduleKey="mail_inbox"
      title="Inbox"
      subtitle="Your emails, AI-classified and organized."
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={syncing}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-theme-border bg-theme-raised text-xs font-semibold text-theme-muted hover:text-theme-fg transition-all"
          >
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} /> Sync
          </button>
          <Link href="/admin/mail/compose">
            <button className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-theme-primary text-white text-xs font-bold hover:bg-theme-primary/90 transition-all shadow-sm">
              <PenLine size={13} /> Compose
            </button>
          </Link>
        </div>
      }
    >
      <div className="flex h-[calc(100vh-168px)] gap-0 overflow-hidden rounded-2xl border border-theme-border shadow-sm">
        {/* Panel 2: Email List */}
        <div className="w-96 flex-shrink-0 border-r border-theme-border flex flex-col bg-theme-page">
          <div className="p-3 border-b border-theme-border space-y-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search emails…"
                className="w-full h-9 pl-8 pr-3 rounded-xl border border-theme-border bg-theme-surface text-xs text-theme-fg outline-none focus:border-theme-primary transition-all"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-fg">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Folder & AI label selector tabs (Horizontal shadcn style) */}
            <div className="flex flex-col gap-2 pt-1 border-t border-theme-border/20">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                {[
                  { id: "Inbox", label: "Inbox", count: messages.filter((m) => m.folder === "Inbox" && !m.is_read).length },
                  { id: "Sent", label: "Sent" },
                  { id: "Starred", label: "Starred", count: messages.filter((m) => m.is_starred).length },
                  { id: "Trash", label: "Trash" }
                ].map((f) => {
                  const active = folder === f.id && !aiFilter;
                  return (
                    <button
                      key={f.id}
                      onClick={() => { setFolder(f.id); setAiFilter(null); }}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex-shrink-0 border flex items-center gap-1",
                        active
                          ? "bg-theme-primary/10 text-theme-primary border-theme-primary/25"
                          : "bg-theme-surface text-theme-muted border-theme-border/50 hover:text-theme-fg"
                      )}
                    >
                      {f.label}
                      {f.count !== undefined && f.count > 0 && (
                        <span className={cn("text-[8px] font-black px-1.5 py-0.2 rounded-full",
                          active ? "bg-theme-primary/20 text-theme-primary" : "bg-theme-raised text-theme-muted"
                        )}>
                          {f.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                <span className="text-[9px] font-black uppercase tracking-wider text-theme-muted/70 mr-1 select-none">AI:</span>
                <button
                  onClick={() => setAiFilter(null)}
                  className={cn(
                    "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all border",
                    aiFilter === null
                      ? "bg-theme-fg/10 text-theme-fg border-theme-border"
                      : "bg-theme-surface text-theme-muted border-theme-border/50 hover:text-theme-fg"
                  )}
                >
                  All
                </button>
                {AI_LABELS.map((label) => {
                  const active = aiFilter === label.id;
                  const labelCount = messages.filter((m) => m.ai_category === label.id).length;
                  return (
                    <button
                      key={label.id}
                      onClick={() => setAiFilter(aiFilter === label.id ? null : label.id)}
                      className={cn(
                        "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all border flex items-center gap-1.5",
                        active
                          ? "bg-theme-primary/15 text-theme-primary border-theme-primary/30"
                          : "bg-theme-surface text-theme-muted border-theme-border/50 hover:text-theme-fg"
                      )}
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", label.dot)} />
                      <span>{label.label}</span>
                      {labelCount > 0 && (
                        <span className="text-[8px] opacity-60">({labelCount})</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-theme-border/30">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 size={20} className="animate-spin text-theme-muted" />
              </div>
            ) : !connected ? (
              <div className="flex flex-col items-center justify-center h-48 px-6 text-center">
                <Mail size={28} className="text-theme-muted/30 mb-3" />
                <p className="text-xs font-semibold text-theme-fg mb-1">Zoho not connected</p>
                <p className="text-[11px] text-theme-muted mb-4">Connect Zoho Mail to start receiving emails.</p>
                <Link href="/admin/mail/config">
                  <button className="px-4 py-2 rounded-xl bg-theme-primary text-white text-xs font-bold">
                    Go to Config
                  </button>
                </Link>
              </div>
            ) : displayed.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48">
                <MailOpen size={28} className="text-theme-muted/30 mb-3" />
                <p className="text-xs text-theme-muted">No emails found</p>
              </div>
            ) : (
              groupedThreads.map((thread) => {
                const msg = thread.latestMessage;
                const active = isSelectedThread(msg);
                const hasUnread = thread.unreadCount > 0;
                
                return (
                  <div
                    key={msg.id}
                    onClick={() => selectMessage(msg)}
                    className={cn(
                      "px-4 py-3 cursor-pointer transition-all group relative",
                      active
                        ? "bg-theme-primary/5 border-l-2 border-l-theme-primary"
                        : "hover:bg-theme-raised/50",
                      hasUnread && "bg-theme-raised/20"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="h-6 w-6 rounded-full bg-theme-primary/10 flex items-center justify-center text-[9px] font-black text-theme-primary flex-shrink-0">
                        {getInitials(msg.from_name)}
                      </div>
                      <span className={cn("text-xs truncate flex-1 flex items-center gap-1.5", hasUnread ? "font-bold text-theme-fg" : "font-medium text-theme-muted")}>
                        <span className="truncate flex-1">{msg.from_name || msg.from_address}</span>
                        <span className="flex items-center gap-1 flex-shrink-0">
                          {thread.count > 1 && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-theme-primary/10 text-theme-primary" title="Total messages in thread">
                              {thread.count}
                            </span>
                          )}
                          {thread.receivedCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-blue-500/10 text-blue-500 flex items-center gap-0.5" title="Received messages">
                              <span>📥</span> {thread.receivedCount}
                            </span>
                          )}
                          {thread.sentCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-500 flex items-center gap-0.5" title="Sent messages">
                              <span>📤</span> {thread.sentCount}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="text-[9px] text-theme-muted flex-shrink-0">
                        {msg.received_at ? formatDistanceToNow(new Date(msg.received_at), { addSuffix: false }) : "—"}
                      </span>
                    </div>
                    <p className={cn("text-[11px] truncate mb-0.5", hasUnread ? "font-semibold text-theme-fg" : "text-theme-muted")}>
                      {msg.subject || "(no subject)"}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-[10px] text-theme-muted truncate flex-1">{msg.ai_summary || msg.preview}</p>
                      <AICategoryBadge category={msg.ai_category || "GENERAL"} />
                      <MailScopeBadge msg={msg} />
                      {msg.has_attachment && <Paperclip size={9} className="text-theme-muted flex-shrink-0" />}
                    </div>
                    <button
                      onClick={(e) => toggleStar(msg, e)}
                      className="absolute right-3 bottom-2.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {msg.is_starred
                        ? <Star     size={11} className="text-amber-400 fill-amber-400" />
                        : <StarOff  size={11} className="text-theme-muted" />}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Panel 3: Reading Pane */}
        <div className="flex-1 flex flex-col bg-theme-surface overflow-hidden">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full">
              <MailOpen size={40} className="text-theme-muted/20 mb-4" />
              <p className="text-sm font-semibold text-theme-muted">Select an email to read</p>
              <p className="text-xs text-theme-muted/60 mt-1">Click any email in the list</p>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="px-6 pt-6 pb-4 border-b border-theme-border flex-shrink-0">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h2 className={cn("text-base font-black text-theme-fg leading-snug flex-1 pr-4",
                    `border-l-4 pl-3 rounded-l-sm`,
                    SENTIMENT_COLORS[selected.ai_sentiment] || "border-l-theme-border"
                  )}>
                    {selected.subject?.replace(/^(Re|Fwd|Fw|RE|FWD):\s*/i, "") || "(no subject)"}
                  </h2>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <AICategoryBadge category={selected.ai_category || "GENERAL"} />
                    <MailScopeBadge msg={selected} size="large" />
                    <button onClick={(e) => toggleStar(selected, e)} className="p-1.5 rounded-lg hover:bg-theme-raised transition-colors">
                      {selected.is_starred
                        ? <Star    size={14} className="text-amber-400 fill-amber-400" />
                        : <StarOff size={14} className="text-theme-muted" />}
                    </button>
                  </div>
                </div>
                {/* Conversation Stats Badges */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] font-black uppercase tracking-wider bg-theme-raised border border-theme-border text-theme-muted px-2.5 py-1 rounded-md">
                    📬 {threadMessages.length} {threadMessages.length === 1 ? "Message" : "Messages"}
                  </span>
                  {threadMessages.filter(m => m.folder === "Inbox").length > 0 && (
                    <span className="text-[10px] font-black uppercase tracking-wider bg-blue-500/10 border border-blue-500/25 text-blue-500 px-2.5 py-1 rounded-md flex items-center gap-1">
                      📥 {threadMessages.filter(m => m.folder === "Inbox").length} Received
                    </span>
                  )}
                  {threadMessages.filter(m => m.folder === "Sent").length > 0 && (
                    <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 px-2.5 py-1 rounded-md flex items-center gap-1">
                      📤 {threadMessages.filter(m => m.folder === "Sent").length} Sent
                    </span>
                  )}
                </div>
              </div>

              {/* Scrollable Conversation Thread Container */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {threadLoading ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 size={24} className="animate-spin text-theme-primary mb-2" />
                    <span className="text-xs text-theme-muted">Loading conversation thread…</span>
                  </div>
                ) : (
                  threadMessages.map((msg, idx) => {
                    const isExpanded = expandedMsgs[msg.id];
                    
                    return (
                      <div key={msg.id} className="rounded-xl border border-theme-border bg-theme-surface shadow-sm overflow-hidden transition-all">
                        {/* Thread Message Header (always visible, toggles collapse) */}
                        <div 
                          onClick={() => toggleMessageExpanded(msg.id)}
                          className={cn(
                            "flex items-center gap-3 px-4 py-3 bg-theme-raised/5 hover:bg-theme-raised/10 cursor-pointer select-none transition-colors",
                            !isExpanded && "text-theme-muted"
                          )}
                        >
                          <div className="h-6 w-6 rounded-full bg-theme-primary/10 flex items-center justify-center text-[10px] font-black text-theme-primary flex-shrink-0">
                            {getInitials(msg.from_name)}
                          </div>
                          
                          <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                            <span className={cn("text-xs truncate", !msg.is_read ? "font-bold text-theme-fg" : "font-semibold text-theme-muted")}>
                              {msg.from_name || msg.from_address}
                            </span>
                            {!isExpanded && (
                              <span className="text-[10px] text-theme-muted truncate flex-1 pr-4 max-w-md">
                                — {msg.preview || "No preview"}
                              </span>
                            )}
                            {isExpanded && (
                              <span className="text-[10px] text-theme-muted truncate">
                                &lt;{msg.from_address}&gt;
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-[10px] text-theme-muted">
                              {format(new Date(msg.received_at), "MMM d, h:mm a")}
                            </span>
                            {msg.has_attachment && <Paperclip size={10} className="text-theme-muted" />}
                          </div>
                        </div>

                        {/* Thread Message Body (rendered if expanded) */}
                        {isExpanded && (
                          <div className="px-4 py-4 border-t border-theme-border/50 bg-theme-surface/50">
                            {/* To Header Details */}
                            <div className="text-[10px] text-theme-muted mb-3 flex flex-col gap-0.5 border-b border-theme-border/20 pb-2">
                              <div><strong>From:</strong> {msg.from_name} ({msg.from_address})</div>
                              <div><strong>To:</strong> {msg.to_address?.join(", ")}</div>
                              {msg.cc_address?.length > 0 && <div><strong>Cc:</strong> {msg.cc_address.join(", ")}</div>}
                            </div>
                            
                            {/* Rich HTML body rendering */}
                            <div className="prose prose-sm max-w-none">
                              {msg.body ? (
                                <div
                                  className="text-sm text-theme-fg leading-relaxed"
                                  dangerouslySetInnerHTML={{ __html: msg.body }}
                                />
                              ) : (
                                <p className="text-sm text-theme-fg leading-relaxed whitespace-pre-wrap">
                                  {msg.preview || "No content available."}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                {/* AI Summary Section */}
                {selected && (selected.ai_summary || aiLoading) && (
                  <div className="my-3 p-3 rounded-xl bg-theme-primary/5 border border-theme-primary/15">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Sparkles size={12} className="text-theme-primary" />
                      <span className="text-[10px] font-bold text-theme-primary uppercase tracking-wider">AI Summary</span>
                    </div>
                    {aiLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 size={11} className="animate-spin text-theme-muted" />
                        <span className="text-[11px] text-theme-muted">Analyzing with AI…</span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-theme-muted leading-relaxed">{selected.ai_summary}</p>
                    )}
                  </div>
                )}

                {/* AI Reply Suggestions */}
                {replySuggestions.length > 0 && !replyOpen && (
                  <div className="py-3 border-t border-theme-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Bot size={12} className="text-theme-primary" />
                      <span className="text-[10px] font-bold text-theme-muted uppercase tracking-wider">AI Reply Suggestions</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {replySuggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => copyReply(s, i)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-theme-raised border border-theme-border text-[11px] text-theme-muted hover:text-theme-fg hover:border-theme-primary/30 transition-all max-w-[280px] text-left"
                        >
                          {copiedIdx === i ? <Check size={10} className="text-emerald-500 flex-shrink-0" /> : <Copy size={10} className="flex-shrink-0" />}
                          <span className="truncate">{s}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reply Panel inside the thread scroll view at the bottom */}
                {replyOpen && (
                  <div className="pt-3 border-t border-theme-border/50">
                    <div className="rounded-xl border border-theme-primary/20 bg-theme-primary/3 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-theme-primary/10">
                        <Reply size={12} className="text-theme-primary" />
                        <span className="text-[11px] font-bold text-theme-primary">Reply to {selected.from_name}</span>
                        <button
                          onClick={() => {
                            replyAttachments.forEach((att) => {
                              if (att.xhr) att.xhr.abort();
                            });
                            setReplyAttachments([]);
                            setReplyOpen(false);
                          }}
                          className="ml-auto text-theme-muted hover:text-theme-fg"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        onPaste={handleReplyPaste}
                        placeholder="Write your reply… (Paste files or click paperclip to attach)"
                        rows={4}
                        className="w-full px-3 py-2 text-xs text-theme-fg bg-transparent resize-none outline-none placeholder:text-theme-muted/50"
                      />

                      {/* Reply Attachments List */}
                      {replyAttachments.length > 0 && (
                        <div className="border-t border-theme-primary/10 bg-theme-primary/5 px-3 py-2 space-y-1.5">
                          {replyAttachments.map((file) => (
                            <div key={file.id} className="flex items-center justify-between p-1.5 rounded-lg bg-theme-surface border border-theme-border/50">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <FileText size={12} className="text-theme-muted flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="text-[10px] font-semibold text-theme-fg truncate">{file.name}</span>
                                    <span className="text-[9px] text-theme-muted flex-shrink-0">({formatBytes(file.size)})</span>
                                  </div>
                                  {file.progress < 100 && !file.error && (
                                    <div className="w-full bg-theme-border/30 rounded-full h-1 mt-1 overflow-hidden">
                                      <div 
                                        className="bg-theme-primary h-1 rounded-full transition-all duration-300" 
                                        style={{ width: `${file.progress}%` }} 
                                      />
                                    </div>
                                  )}
                                  {file.error && (
                                    <p className="text-[9px] text-red-500 font-medium mt-0.5">{file.error}</p>
                                  )}
                                </div>
                              </div>
                              <button 
                                onClick={() => removeReplyAttachment(file.id)} 
                                className="p-1 rounded text-theme-muted hover:text-theme-fg hover:bg-theme-raised transition-all ml-2"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex justify-between items-center px-3 pb-2 pt-2 border-t border-theme-primary/5">
                        <label className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-theme-border text-theme-muted hover:text-theme-fg cursor-pointer text-[10px] font-semibold transition-all">
                          <Paperclip size={11} /> Attach File
                          <input type="file" multiple className="hidden" onChange={handleReplyFileChange} />
                        </label>
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              replyAttachments.forEach((att) => {
                                if (att.xhr) att.xhr.abort();
                              });
                              setReplyAttachments([]);
                              setReplyOpen(false);
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-theme-muted hover:bg-theme-raised transition-all"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={sendReply}
                            disabled={replySending || (!replyBody.trim() && replyAttachments.length === 0)}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-theme-primary text-white text-xs font-bold hover:bg-theme-primary/90 transition-all disabled:opacity-50"
                          >
                            {replySending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                            Send Reply
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Bar */}
              {!replyOpen && (
                <div className="flex items-center gap-2 px-6 py-3 border-t border-theme-border flex-shrink-0">
                  <button
                    onClick={() => setReplyOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-theme-primary text-white text-xs font-bold hover:bg-theme-primary/90 transition-all"
                  >
                    <Reply size={13} /> Reply
                  </button>
                  <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-theme-border text-theme-muted hover:text-theme-fg hover:bg-theme-raised text-xs font-semibold transition-all">
                    <Forward size={13} /> Forward
                  </button>
                  <button className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl border border-theme-border text-theme-muted hover:text-rose-500 hover:border-rose-500/30 text-xs font-semibold transition-all">
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
