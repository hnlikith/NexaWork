"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export interface ActionItem {
  task: string;
  assignee_name: string;
  assignee_id?: string;
  due_date: string | null;
  done: boolean;
}

export interface MeetingMinutes {
  id: string;
  meeting_id: string;
  created_by: string;
  transcript: string | null;
  summary: string | null;
  key_topics: string[];
  decisions: string[];
  action_items: ActionItem[];
  sentiment?: "positive" | "neutral" | "negative";
  meeting_effectiveness?: "high" | "medium" | "low";
  follow_up_required?: boolean;
  status: "draft" | "published";
  analysis_model: string;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
  creator?: { id: string; name: string };
}

export function useMeetingMinutes(meetingId: string | null) {
  const [minutes, setMinutes] = useState<MeetingMinutes | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    if (!meetingId) return;
    setLoading(true);
    const res = await window.fetch(`/api/meetings/minutes?meeting_id=${meetingId}`);
    const data = await res.json();
    setMinutes(data || null);
    setLoading(false);
  }, [meetingId]);

  useEffect(() => { fetch(); }, [fetch]);

  // Realtime sync
  useEffect(() => {
    if (!meetingId) return;
    const sub = supabase
      .channel(`mom:${meetingId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "meeting_minutes", filter: `meeting_id=eq.${meetingId}` },
        () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [meetingId, fetch]);

  const save = useCallback(async (payload: Partial<MeetingMinutes> & { meeting_id: string; created_by: string }) => {
    setSaving(true);
    const method = minutes ? "PATCH" : "POST";
    const res = await window.fetch("/api/meetings/minutes", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setMinutes(data);
    setSaving(false);
    return data as MeetingMinutes;
  }, [minutes]);

  const analyze = useCallback(async (params: {
    transcript: string;
    meeting_title: string;
    participants: string[];
    duration_minutes?: number;
    meeting_id: string;
    created_by: string;
  }) => {
    setAnalyzing(true);
    try {
      const res = await window.fetch("/api/meetings/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params),
      });
      const analysis = await res.json();
      if (analysis.error) throw new Error(analysis.error);

      // Persist the analysis
      const saved = await save({
        meeting_id: params.meeting_id,
        created_by: params.created_by,
        transcript: params.transcript,
        summary: analysis.summary,
        key_topics: analysis.key_topics || [],
        decisions: analysis.decisions || [],
        action_items: analysis.action_items || [],
        sentiment: analysis.sentiment,
        meeting_effectiveness: analysis.meeting_effectiveness,
        follow_up_required: analysis.follow_up_required,
        analyzed_at: new Date().toISOString(),
      });
      return saved;
    } finally {
      setAnalyzing(false);
    }
  }, [save]);

  const toggleActionItem = useCallback(async (index: number) => {
    if (!minutes) return;
    const updated = minutes.action_items.map((item, i) =>
      i === index ? { ...item, done: !item.done } : item
    );
    await save({ meeting_id: minutes.meeting_id, created_by: minutes.created_by, action_items: updated });
  }, [minutes, save]);

  const publish = useCallback(async () => {
    if (!minutes) return;
    await save({ meeting_id: minutes.meeting_id, created_by: minutes.created_by, status: "published" });
  }, [minutes, save]);

  return { minutes, loading, analyzing, saving, fetch, save, analyze, toggleActionItem, publish };
}
