"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/layout/AuthProvider";

export interface Message {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  reply_to_id?: string | null;
  is_deleted: boolean;
  edited_at?: string | null;
  created_at: string;
}

export interface Channel {
  id: string;
  name: string;
  description?: string | null;
  type: "text" | "announcement" | "global";
  team_id?: string | null;
  project_id?: string | null;
  department_name?: string | null;
  category: "global" | "team" | "department" | "project" | "other";
  is_global: boolean;
  unread_count?: number;
}

export interface PresenceUser {
  id: string;
  name: string;
  online_at: string;
}

// ─── useChannels ─────────────────────────────────────────────────────────────
// Loads all channels the current user is a member of (or all for admin)
export function useChannels(_isAdmin = false) {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Always fetch via membership IDs — RLS is membership-gated so a raw
    // unfiltered query returns 0 rows even for admins unless their role
    // matches the admin RLS exception. Membership-based fetch always works
    // because 022 migration backfills admins into every channel.
    const { data: memberOf } = await supabase
      .from("channel_members")
      .select("channel_id")
      .eq("employee_id", user.id);
    const ids = (memberOf || []).map((m: any) => m.channel_id);
    if (ids.length === 0) { setChannels([]); setLoading(false); return; }

    const { data, error } = await supabase
      .from("channels")
      .select("id, name, description, type, team_id, project_id, department_name, category, is_global")
      .in("id", ids)
      .order("category")
      .order("name");
    if (!error && data) {
      // Fetch unread counts
      const channelsWithUnread = await Promise.all(
        (data as Channel[]).map(async (ch) => {
          const { count } = await supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("channel_id", ch.id)
            .eq("is_deleted", false)
            .neq("sender_id", user.id)
            .gt("created_at", await getLastRead(ch.id, user.id));
          return { ...ch, unread_count: count ?? 0 };
        })
      );
      setChannels(channelsWithUnread);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  // Realtime: refresh channel list when memberships change
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("channel-members-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_members" }, fetchChannels)
      .on("postgres_changes", { event: "*", schema: "public", table: "channels" }, fetchChannels)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, fetchChannels]);

  return { channels, loading, refetch: fetchChannels };
}

async function getLastRead(channelId: string, userId: string): Promise<string> {
  const { data } = await supabase
    .from("channel_members")
    .select("last_read_at")
    .eq("channel_id", channelId)
    .eq("employee_id", userId)
    .single();
  return data?.last_read_at ?? new Date(0).toISOString();
}

// ─── useMessaging ─────────────────────────────────────────────────────────────
export function useMessaging(channelId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const pendingIds = useRef<Set<string>>(new Set());

  const fetchMessages = useCallback(async () => {
    if (!channelId) { setMessages([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("channel_id", channelId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
      .limit(100);
    if (!error && data) setMessages(data as Message[]);
    setLoading(false);

    // Mark as read
    if (user && channelId) {
      await supabase
        .from("channel_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("channel_id", channelId)
        .eq("employee_id", user.id);
    }
  }, [channelId, user]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  useEffect(() => {
    if (!channelId) return;

    const ch = supabase
      .channel(`messages:${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const msg = payload.new as Message;
          // Don't double-add optimistic messages
          if (pendingIds.current.has(msg.id)) {
            pendingIds.current.delete(msg.id);
            setMessages(prev => prev.map(m => m.id === `optimistic-${msg.id}` ? msg : m));
            return;
          }
          setMessages(prev => {
            if (prev.find(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });

          // Mark read if this channel is open
          if (user) {
            supabase.from("channel_members")
              .update({ last_read_at: new Date().toISOString() })
              .eq("channel_id", channelId)
              .eq("employee_id", user.id);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const msg = payload.new as Message;
          setMessages(prev => msg.is_deleted
            ? prev.filter(m => m.id !== msg.id)
            : prev.map(m => m.id === msg.id ? msg : m)
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [channelId, user]);

  const sendMessage = useCallback(async (
    content: string,
    fileUrl?: string,
    fileData?: { name: string; type: string; size: number }
  ) => {
    if (!user || !channelId || (!content.trim() && !fileUrl)) return;

    // Optimistic insert
    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic: Message = {
      id: optimisticId,
      channel_id: channelId,
      sender_id: user.id,
      sender_name: user.name || "You",
      content: content.trim(),
      file_url: fileUrl ?? null,
      file_name: fileData?.name ?? null,
      file_type: fileData?.type ?? null,
      file_size: fileData?.size ?? null,
      reply_to_id: null,
      is_deleted: false,
      edited_at: null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);

    const { data, error } = await supabase.from("messages").insert({
      channel_id: channelId,
      sender_id:  user.id,
      sender_name: user.name || "Unknown",
      content:    content.trim(),
      file_url:   fileUrl ?? null,
      file_name:  fileData?.name ?? null,
      file_type:  fileData?.type ?? null,
      file_size:  fileData?.size ?? null,
    }).select().single();

    if (error) {
      // Rollback optimistic
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      console.error("Send failed:", error.message);
    } else if (data) {
      // Replace optimistic with real
      setMessages(prev => prev.map(m => m.id === optimisticId ? data as Message : m));
    }
  }, [user, channelId]);

  const deleteMessage = useCallback(async (messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
    await supabase.from("messages").update({ is_deleted: true }).eq("id", messageId);
  }, []);

  return { messages, loading, sendMessage, deleteMessage };
}

// ─── usePresence ─────────────────────────────────────────────────────────────
export function usePresence(channelId: string | null) {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!user || !channelId) return;

    const ch = supabase.channel(`presence:${channelId}`, {
      config: { presence: { key: user.id } },
    });

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<PresenceUser>();
      const users = Object.values(state).flat();
      setOnlineUsers(users);
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ id: user.id, name: user.name || "Unknown", online_at: new Date().toISOString() });
      }
    });

    return () => {
      ch.untrack().then(() => supabase.removeChannel(ch));
    };
  }, [channelId, user]);

  return { onlineUsers };
}
