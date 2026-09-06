"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/layout/AuthProvider";

export interface Meeting {
  id: string;
  title: string;
  description?: string;
  room_name: string;
  host_id: string;
  channel_id?: string;
  scheduled_at?: string;
  started_at?: string;
  ended_at?: string;
  status: "scheduled" | "active" | "ended" | "cancelled";
  type: "video" | "audio" | "screen";
  max_participants: number;
  created_at: string;
  host?: { id: string; name: string; designation?: string };
  meeting_participants?: Array<{
    employee_id: string;
    role: string;
    joined_at?: string;
    employees?: { id: string; name: string };
  }>;
}

export function useMeetings(filter?: { status?: string; channel_id?: string }) {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter?.status) params.set("status", filter.status);
    if (filter?.channel_id) params.set("channel_id", filter.channel_id);
    const res = await window.fetch(`/api/meetings?${params}`);
    if (res.ok) setMeetings(await res.json());
    setLoading(false);
  }, [filter?.status, filter?.channel_id]);

  useEffect(() => { fetch(); }, [fetch]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel("meetings-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings" }, fetch)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetch]);

  const scheduleMeeting = useCallback(async (data: {
    title: string;
    description?: string;
    scheduled_at?: string;
    type?: "video" | "audio" | "screen";
    channel_id?: string;
    participant_ids?: string[];
  }) => {
    if (!user) return null;
    const res = await window.fetch("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, host_id: user.id }),
    });
    if (res.ok) { await fetch(); return res.json(); }
    return null;
  }, [user, fetch]);

  const endMeeting = useCallback(async (meetingId: string) => {
    await window.fetch("/api/meetings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: meetingId, status: "ended", ended_at: new Date().toISOString() }),
    });
    await fetch();
  }, [fetch]);

  const getLivekitToken = useCallback(async (roomName: string): Promise<{ token: string; wsUrl: string } | null> => {
    if (!user) return null;
    const res = await window.fetch(`/api/livekit?room=${roomName}&username=${encodeURIComponent(user.name)}&userId=${user.id}`);
    if (res.ok) return res.json();
    return null;
  }, [user]);

  return { meetings, loading, scheduleMeeting, endMeeting, getLivekitToken, refetch: fetch };
}
