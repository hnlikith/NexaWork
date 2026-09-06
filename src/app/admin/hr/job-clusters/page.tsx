"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  Network, Plus, Search, Edit2, Briefcase, Cpu, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface JobCluster {
  id: number;
  cluster_id: string;
  company: string;
  job_title_variants: string[];
  mandatory_skills: any[];
  preferred_skills: any[];
  domain_knowledge: any[];
  experience_requirements: any;
  education: any;
  match_weights: any;
  gemma_keywords: string[];
  active: boolean;
  created_at: string;
}

const defaultForm = {
  cluster_id: "",
  company: "NexaWork",
  job_title_variants: "",
  mandatory_skills: [] as any[],
  preferred_skills: [] as any[],
  domain_knowledge: [] as any[],
  experience_requirements: { years_required: 0, seniority_levels: ["Junior"] },
  education: { required: "Bachelor's", preferred: "Master's" },
  match_weights: { technical_skills: 40, domain_knowledge: 25, experience_years: 20, education: 15 },
  gemma_keywords: "",
  active: true,
};

function ClusterCard({ cluster, onEdit, onToggle }: {
  cluster: JobCluster;
  onEdit: () => void;
  onToggle: () => void;
}) {
  return (
    <Card className="group overflow-hidden p-0 transition-shadow hover:shadow-sm">
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <Network size={16} className="text-primary" />
          </div>
          <button type="button" onClick={onToggle}>
            <Badge
              variant={cluster.active ? "default" : "secondary"}
              className={cn("cursor-pointer", cluster.active && "bg-emerald-500 hover:bg-emerald-500/90")}
            >
              {cluster.active ? "Active" : "Inactive"}
            </Badge>
          </button>
        </div>

        <div>
          <h3 className="font-semibold text-sm text-foreground truncate">
            {cluster.job_title_variants[0] || cluster.cluster_id}
          </h3>
          <p className="text-xs font-medium text-primary mt-0.5">{cluster.cluster_id}</p>
        </div>

        <div className="flex flex-wrap gap-1">
          {cluster.gemma_keywords.slice(0, 5).map((k) => (
            <Badge key={k} variant="outline" className="text-[10px] font-normal">
              {k}
            </Badge>
          ))}
          {cluster.gemma_keywords.length > 5 && (
            <span className="text-[10px] text-muted-foreground font-medium self-center">
              +{cluster.gemma_keywords.length - 5}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-3 border-t border-border bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Briefcase size={11} /> {cluster.experience_requirements?.years_required ?? 0}+ yrs
          </span>
          <span className="flex items-center gap-1">
            <Cpu size={11} /> {cluster.mandatory_skills?.length ?? 0} skills
          </span>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
          <Edit2 size={13} />
        </Button>
      </div>
    </Card>
  );
}

export default function JobClustersPage() {
  const [clusters, setClusters] = useState<JobCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<JobCluster | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchClusters();
    const channel = supabase
      .channel("job-clusters-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "job_clusters" }, fetchClusters)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchClusters() {
    try {
      const { data, error } = await supabase
        .from("job_clusters")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setClusters(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(defaultForm);
    setOpen(true);
  }

  function openEdit(cluster: JobCluster) {
    setEditing(cluster);
    setForm({
      ...cluster,
      job_title_variants: cluster.job_title_variants.join(", "),
      gemma_keywords: cluster.gemma_keywords.join(", "),
    } as any);
    setOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.cluster_id.trim()) return toast.warning("Cluster ID is required");
    setSaving(true);
    try {
      const payload = {
        ...form,
        job_title_variants: form.job_title_variants.split(",").map(s => s.trim()).filter(Boolean),
        gemma_keywords: form.gemma_keywords.split(",").map(s => s.trim()).filter(Boolean),
      };

      if (editing) {
        const { error } = await supabase.from("job_clusters").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Cluster updated");
      } else {
        const { error } = await supabase.from("job_clusters").insert(payload);
        if (error) throw error;
        toast.success("Cluster created");
      }
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: number, current: boolean) {
    try {
      const { error } = await supabase.from("job_clusters").update({ active: !current }).eq("id", id);
      if (error) throw error;
      toast.success(`Cluster ${!current ? "activated" : "deactivated"}`);
    } catch {
      toast.error("Failed to update status");
    }
  }

  const filtered = clusters.filter(c =>
    c.cluster_id.toLowerCase().includes(search.toLowerCase()) ||
    c.job_title_variants.some(v => v.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <DashboardShell
      moduleKey="job_clusters"
      title="Job Clusters"
      subtitle="Define job profiles and matching criteria for candidate screening"
      actions={
        <Button onClick={openCreate} size="sm">
          <Plus size={13} /> New Cluster
        </Button>
      }
    >
      <div className="space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total clusters", value: clusters.length },
            { label: "Active", value: clusters.filter(c => c.active).length },
            { label: "Inactive", value: clusters.filter(c => !c.active).length },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <p className="text-xl font-bold text-foreground tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by cluster ID or job title…"
            className="pl-9"
          />
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center rounded-xl border border-dashed border-border bg-card">
            <Network size={32} className="text-muted-foreground opacity-40" />
            <p className="text-sm font-semibold text-foreground">No clusters found</p>
            <Button variant="link" size="sm" onClick={openCreate}>
              Create your first cluster
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((cluster) => (
              <ClusterCard
                key={cluster.id}
                cluster={cluster}
                onEdit={() => openEdit(cluster)}
                onToggle={() => toggleActive(cluster.id, cluster.active)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg !grid-rows-[auto_1fr_auto] !grid p-0 overflow-hidden gap-0 max-h-[calc(100vh-6rem)] sm:max-h-[80vh]">
          <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-6 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
              {editing ? <Edit2 size={16} /> : <Network size={16} />}
            </div>
            <div className="flex-1 text-left">
              <DialogTitle className="text-sm font-semibold">{editing ? "Edit Cluster" : "New Cluster"}</DialogTitle>
              <DialogDescription className="text-xs">
                {editing ? `Editing ${editing.cluster_id}` : "Define a new job profile for candidate matching"}
              </DialogDescription>
            </div>
          </DialogHeader>

          <form id="cluster-form" onSubmit={handleSave} className="min-h-0 overflow-y-auto px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Cluster ID</Label>
                <Input
                  required
                  value={form.cluster_id}
                  onChange={(e) => setForm({ ...form, cluster_id: e.target.value })}
                  placeholder="e.g. NEXAWORK-FRONTEND"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Company</Label>
                <Input
                  required
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Job title variants (comma-separated)</Label>
              <Input
                required
                value={form.job_title_variants}
                onChange={(e) => setForm({ ...form, job_title_variants: e.target.value })}
                placeholder="Full Stack Developer, Senior React Engineer"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">AI matching keywords (comma-separated)</Label>
              <Textarea
                required
                value={form.gemma_keywords}
                onChange={(e) => setForm({ ...form, gemma_keywords: e.target.value })}
                placeholder="react, typescript, node.js, architecture"
                rows={3}
                className="resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Required experience (years)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.experience_requirements.years_required}
                  onChange={(e) => setForm({
                    ...form,
                    experience_requirements: { ...form.experience_requirements, years_required: parseInt(e.target.value) || 0 },
                  })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Technical skills weight (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.match_weights.technical_skills}
                  onChange={(e) => setForm({
                    ...form,
                    match_weights: { ...form.match_weights, technical_skills: parseInt(e.target.value) || 0 },
                  })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div className="space-y-0.5">
                <Label className="text-xs">Cluster active</Label>
                <p className="text-[11px] text-muted-foreground">Include this cluster in candidate matching</p>
              </div>
              <Switch
                checked={form.active}
                onCheckedChange={(checked) => setForm({ ...form, active: checked })}
              />
            </div>
          </form>

          <DialogFooter className="!mx-0 !mb-0 !rounded-none flex-row items-center sm:justify-end gap-2 border-t border-border bg-background px-6 py-4">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="cluster-form" size="sm" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {editing ? "Update Cluster" : "Create Cluster"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
