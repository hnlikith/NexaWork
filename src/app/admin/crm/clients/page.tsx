"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { DashboardShell } from "@/components/layout/DashboardShell";
import { ConvertedClient } from "@/store/crmStore";
import {
  Search as SearchIcon,
  Plus, Trash2, Pencil, AlertTriangle, UserCheck, Phone, User, TrendingUp, Users,
  RefreshCw, Mail, ArrowRightLeft, MoreVertical, Loader2, Building2, Receipt, Check,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { validateGSTIN, extractPANFromGSTIN } from "@/lib/gst";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const formatRupee = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);

const TIER_TONE: Record<string, string> = {
  Strategic:     "text-purple-700 dark:text-purple-400 border-purple-500/30 bg-purple-500/10",
  "Key Account": "text-sky-700 dark:text-sky-400 border-sky-500/30 bg-sky-500/10",
  Standard:      "",
};

function statusBadge(status: ConvertedClient["status"]) {
  if (status === "Active")  return <Badge className="bg-emerald-500 hover:bg-emerald-500/90 text-white capitalize">{status}</Badge>;
  if (status === "Pending") return <Badge className="bg-amber-500 hover:bg-amber-500/90 text-white capitalize">{status}</Badge>;
  return <Badge variant="destructive" className="capitalize">{status}</Badge>;
}

function initials(name?: string) {
  return (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

const EMPTY_FORM = {
  id: "" as string | undefined,
  company: "", leadName: "", leadPhone: "", value: 0,
  empName: "", empId: "", status: "Active" as ConvertedClient["status"],
  tier: "Standard" as ConvertedClient["tier"],
  gstin: "", pan: "", email: "", address: "",
};

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function CRMClientsPage() {
  const [clients, setClients] = useState<ConvertedClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("All");

  // Dialog state — single source of truth for add+edit
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<ConvertedClient | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchClients();
    const channel = supabase
      .channel("clients_page_sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => fetchClients())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchClients = async () => {
    const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    if (error) toast.error("Error fetching clients");
    else {
      const mapped = (data || []).map((c: any) => ({
        id: c.id,
        company: c.name || c.company || "Unknown",
        leadName: c.lead_name || "N/A",
        leadPhone: c.lead_phone || "N/A",
        value: Number(c.value || 0),
        empName: c.emp_id || "Direct",
        empId: c.emp_id || "",
        status: (c.status as any) || "Active",
        tier: (c.tier as any) || "Standard",
        convertedDate: c.converted_at
          ? new Date(c.converted_at).toLocaleDateString("en-IN", { month: "short", day: "2-digit", year: "numeric" })
          : new Date(c.created_at).toLocaleDateString("en-IN", { month: "short", day: "2-digit", year: "numeric" }),
        fromPipeline: !!c.from_pipeline,
        gstin: c.gstin || "",
        pan: c.pan || "",
        email: c.email || "",
        address: c.address || "",
      }));
      setClients(mapped);
    }
    setLoading(false);
  };

  const filtered = useMemo(() => clients.filter((c) => {
    const q = search.toLowerCase();
    const ms = !search || c.company.toLowerCase().includes(q) || c.leadName.toLowerCase().includes(q) || c.empName.toLowerCase().includes(q);
    return ms && (tierFilter === "All" || c.tier === tierFilter);
  }), [clients, search, tierFilter]);

  const totalRevenue = clients.reduce((s, c) => s + c.value, 0);
  const totalClients = clients.length;
  const activeClients = clients.filter((c) => c.status === "Active").length;
  const convertedFromPipeline = clients.filter((c) => c.fromPipeline).length;

  /* Dialog actions */
  const openAdd = () => { setEditingId(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (c: ConvertedClient) => {
    setEditingId(c.id);
    setForm({
      id: c.id, company: c.company, leadName: c.leadName, leadPhone: c.leadPhone,
      value: c.value, empName: c.empName, empId: c.empId,
      status: c.status, tier: c.tier,
      gstin: c.gstin || "", pan: c.pan || "", email: c.email || "", address: c.address || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!form.company.trim()) { toast.warning("Company name is required"); return; }
    if (form.gstin && !validateGSTIN(form.gstin)) { toast.error("Invalid GSTIN format"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.company, company: form.company,
        lead_name: form.leadName, lead_phone: form.leadPhone,
        email: form.email, address: form.address,
        value: form.value, status: form.status, tier: form.tier,
        gstin: form.gstin, pan: form.pan,
      };
      if (editingId) {
        const { error } = await supabase.from("clients").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Client updated");
      } else {
        const { error } = await supabase.from("clients").insert([{ ...payload, from_pipeline: false }]);
        if (error) throw error;
        toast.success("Client added");
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("clients").delete().eq("id", confirmDelete.id);
      if (error) throw error;
      toast.success("Client removed");
      setConfirmDelete(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    } finally { setDeleting(false); }
  };

  /* GSTIN auto-extract PAN */
  const onGstinChange = (val: string) => {
    const upper = val.toUpperCase();
    const pan = extractPANFromGSTIN(upper);
    setForm(f => ({ ...f, gstin: upper, pan: pan || f.pan }));
  };

  const stats = [
    { label: "Total Revenue",    value: formatRupee(totalRevenue),         icon: TrendingUp,     tone: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: "Total Clients",    value: String(totalClients),              icon: Users,          tone: "text-sky-600",     bg: "bg-sky-500/10" },
    { label: "Active Accounts",  value: `${activeClients}/${totalClients}`, icon: UserCheck,     tone: "text-violet-600",  bg: "bg-violet-500/10" },
    { label: "From Pipeline",    value: String(convertedFromPipeline),     icon: ArrowRightLeft, tone: "text-amber-600",   bg: "bg-amber-500/10" },
  ];

  const gstinInvalid = form.gstin && !validateGSTIN(form.gstin);

  return (
    <DashboardShell
      moduleKey="crm_clients"
      title="Client Registry"
      subtitle="Live enterprise client list — synchronized with the Sales Pipeline"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchClients}><RefreshCw size={13} /> Refresh</Button>
          <Button size="sm" onClick={openAdd}><Plus size={13} /> Add Client</Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, tone, bg }) => (
            <Card key={label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg", bg)}>
                  <Icon size={15} className={tone} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={cn("text-xl font-semibold tabular-nums leading-tight", tone)}>{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="p-0 overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={tierFilter} onValueChange={setTierFilter}>
              <TabsList>
                <TabsTrigger value="All" className="text-xs">All</TabsTrigger>
                <TabsTrigger value="Strategic" className="text-xs">Strategic</TabsTrigger>
                <TabsTrigger value="Key Account" className="text-xs">Key Account</TabsTrigger>
                <TabsTrigger value="Standard" className="text-xs">Standard</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative">
              <SearchIcon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client, contact, employee…"
                className="h-8 w-64 pl-8 text-xs" />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>GSTIN</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right w-[60px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 12 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                          <Users size={20} className="text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {search ? "No clients match your search" : "No clients yet"}
                        </p>
                        {!search && <Button size="sm" onClick={openAdd}><Plus size={12} /> Add First Client</Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filtered.map((client) => (
                  <TableRow key={client.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-[10px] font-semibold bg-sky-500/10 text-sky-600">{initials(client.company)}</AvatarFallback>
                        </Avatar>
                        <p className="text-sm font-medium text-foreground">{client.company}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-foreground">
                        <User size={11} className="text-muted-foreground" /> {client.leadName}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone size={11} /> {client.leadPhone}
                      </div>
                    </TableCell>
                    <TableCell>
                      {client.email ? (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Mail size={11} /> <span className="truncate max-w-[160px]">{client.email}</span>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm font-semibold text-emerald-600 tabular-nums">{formatRupee(client.value)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[9px] font-semibold">{initials(client.empName)}</AvatarFallback>
                        </Avatar>
                        <div className="leading-tight">
                          <p className="text-xs font-medium text-foreground">{client.empName}</p>
                          {client.empId && <p className="text-[10px] text-muted-foreground tabular-nums">{client.empId}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{statusBadge(client.status)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(TIER_TONE[client.tier])}>{client.tier}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground tabular-nums">{client.gstin || "—"}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{client.convertedDate}</TableCell>
                    <TableCell>
                      {client.fromPipeline ? (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-500/10 gap-1">
                          <Check size={9} /> Pipeline
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Direct</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical size={13} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => openEdit(client)}>
                            <Pencil size={12} className="mr-2" /> Edit Client
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmDelete(client)}>
                            <Trash2 size={12} className="mr-2" /> Remove Client
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-2.5">
            <span className="text-xs text-muted-foreground">
              {filtered.length} of {totalClients} clients · {convertedFromPipeline} from pipeline
            </span>
            <span className="text-xs text-muted-foreground">
              Total portfolio: <span className="font-semibold text-foreground tabular-nums">{formatRupee(totalRevenue)}</span>
            </span>
          </div>
        </Card>
      </div>

      {/* Add / Edit Client Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl !grid-rows-[auto_1fr_auto] !grid p-0 overflow-hidden gap-0 max-h-[calc(100vh-4rem)] sm:max-h-[88vh]">
          <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-6 py-4">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0",
              editingId ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary")}>
              {editingId ? <Pencil size={16} /> : <Plus size={16} />}
            </div>
            <div className="flex-1 text-left">
              <DialogTitle className="text-sm font-semibold">
                {editingId ? "Edit Client" : "Add New Client"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {editingId ? `Updating ${form.company || "client"}` : "Register a new enterprise client in the registry"}
              </DialogDescription>
            </div>
          </DialogHeader>

          <form id="client-form" onSubmit={handleSave} className="min-h-0 overflow-y-auto px-6 py-5 space-y-5">
            {/* Company section */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Building2 size={11} /> Company Identity
              </p>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Company / Organisation Name *</Label>
                  <Input
                    value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                    placeholder="e.g. Acme Industries Pvt. Ltd." autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Billing Address</Label>
                  <Textarea
                    value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    rows={2} placeholder="Street, City, State, Pincode" className="resize-none"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Contact section */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <User size={11} /> Contact Details
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Contact Person</Label>
                  <Input value={form.leadName} onChange={e => setForm(f => ({ ...f, leadName: e.target.value }))} placeholder="Full name" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input value={form.leadPhone} onChange={e => setForm(f => ({ ...f, leadPhone: e.target.value.replace(/[^0-9+\- ]/g, "").slice(0, 18) }))} placeholder="+91 98765 43210" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="accounts@company.com" />
                </div>
              </div>
            </div>

            <Separator />

            {/* Tax section */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Receipt size={11} /> Tax Identifiers
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">GSTIN</Label>
                  <div className="relative">
                    <Input
                      value={form.gstin} onChange={e => onGstinChange(e.target.value)}
                      placeholder="29ABCDE1234F1Z5" className={cn("uppercase", gstinInvalid && "border-rose-500 focus-visible:ring-rose-500/30")}
                    />
                    {gstinInvalid && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-rose-500">
                        <AlertTriangle size={12} />
                      </div>
                    )}
                    {form.gstin && !gstinInvalid && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">
                        <Check size={12} />
                      </div>
                    )}
                  </div>
                  {form.gstin && !gstinInvalid && <p className="text-[10px] text-emerald-600">Valid format · PAN auto-extracted</p>}
                  {gstinInvalid && <p className="text-[10px] text-rose-500">Invalid GSTIN format</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">PAN</Label>
                  <Input value={form.pan} onChange={e => setForm(f => ({ ...f, pan: e.target.value.toUpperCase() }))} placeholder="ABCDE1234F" className="uppercase" />
                </div>
              </div>
            </div>

            <Separator />

            {/* Status, tier, value */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <TrendingUp size={11} /> Account &amp; Revenue
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Annual Revenue (₹)</Label>
                  <Input
                    type="number" min={0}
                    value={form.value || ""} onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))}
                    placeholder="0" className="tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as ConvertedClient["status"] }))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Churned">Churned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tier</Label>
                  <Select value={form.tier} onValueChange={(v) => setForm(f => ({ ...f, tier: v as ConvertedClient["tier"] }))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Standard">Standard</SelectItem>
                      <SelectItem value="Key Account">Key Account</SelectItem>
                      <SelectItem value="Strategic">Strategic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </form>

          <DialogFooter className="!mx-0 !mb-0 !rounded-none flex-row items-center sm:justify-between gap-2 border-t border-border bg-background px-6 py-4">
            <p className="text-xs text-muted-foreground hidden sm:block">
              {editingId ? "Changes reflect across all linked invoices &amp; deals" : "Available for invoices &amp; pipeline immediately"}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" form="client-form" size="sm" disabled={saving || !form.company.trim()}>
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {editingId ? "Save Changes" : "Add Client"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove client?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">&ldquo;{confirmDelete?.company}&rdquo;</span> will be permanently removed from the registry. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  );
}
