"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useState, useEffect, useCallback, useMemo } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import {
  ShoppingCart, Plus, Search, IndianRupee, Clock, CheckCircle2, Tag, X, Trash2,
  RefreshCw, Building2, FileText, Phone, Mail, User, Receipt,
  CalendarDays, Layers, CreditCard, Share2, Download, Banknote,
  Smartphone, ArrowLeftRight, BookOpen, CheckCircle, AlertCircle, Copy, Printer,
  Pencil, TrendingUp, ChevronsUpDown, Loader2,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface Employee {
  id: string; employee_id: string; name: string; department: string; designation: string;
}

interface Vendor {
  id: string; name: string; contact_person: string | null;
  email: string | null; phone: string | null; category: string;
  total_paid: number; created_at: string;
}

interface Purchase {
  id: string; purchase_number: string; vendor_id: string | null;
  vendor_name: string; description: string; category: string;
  amount: number; date: string; status: "pending" | "paid" | "cancelled";
  invoice_id: string | null; notes: string | null; created_at: string;
  vendors?: Vendor | null;
  filed_by_emp_id?: string;
  filed_by_name?: string;
  filed_by_dept?: string;
  filed_by_desig?: string;
  filed_by_uuid?: string;
}

interface PaymentRow {
  id: string;
  mode: "Cash" | "UPI" | "Bank Transfer" | "Cheque";
  amount: string;
  reference: string;
}

/* ─── Constants ──────────────────────────────────────────────────────────── */

const CATEGORIES = ["Infrastructure", "Equipment", "Facilities", "Legal", "Logistics", "Marketing", "Supplies", "Software", "General"];

const CATEGORY_TONE: Record<string, string> = {
  Infrastructure: "text-sky-600 border-sky-500/20 bg-sky-500/10",
  Equipment:      "text-purple-600 border-purple-500/20 bg-purple-500/10",
  Facilities:     "text-emerald-600 border-emerald-500/20 bg-emerald-500/10",
  Legal:          "text-amber-600 border-amber-500/20 bg-amber-500/10",
  Logistics:      "text-orange-600 border-orange-500/20 bg-orange-500/10",
  Marketing:      "text-pink-600 border-pink-500/20 bg-pink-500/10",
  Software:       "text-indigo-600 border-indigo-500/20 bg-indigo-500/10",
};

const PAYMENT_MODES = [
  { mode: "Cash",          icon: Banknote,       tone: "text-emerald-600 bg-emerald-500/10" },
  { mode: "UPI",           icon: Smartphone,     tone: "text-purple-600 bg-purple-500/10" },
  { mode: "Bank Transfer", icon: ArrowLeftRight, tone: "text-sky-600 bg-sky-500/10" },
  { mode: "Cheque",        icon: BookOpen,       tone: "text-amber-600 bg-amber-500/10" },
] as const;

const EMPTY_FORM = {
  vendor_id: "", vendor_name: "", description: "", category: "", amount: "",
  date: new Date().toISOString().split("T")[0], notes: "",
};

const EMPTY_VENDOR_FORM = { name: "", contact_person: "", email: "", phone: "", category: "General", address: "", gstin: "" };

function initials(name?: string) {
  return (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function statusBadge(status: Purchase["status"]) {
  if (status === "paid")      return <Badge className="bg-emerald-500 hover:bg-emerald-500/90 text-white capitalize gap-1"><CheckCircle size={10} /> Paid</Badge>;
  if (status === "cancelled") return <Badge variant="destructive" className="capitalize gap-1"><X size={10} /> Cancelled</Badge>;
  return <Badge className="bg-amber-500 hover:bg-amber-500/90 text-white capitalize gap-1"><AlertCircle size={10} /> Due</Badge>;
}

function genReceiptNumber() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const ny = String(d.getFullYear() + 1).slice(2);
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `RCPT-${seq}/${yy}-${ny}`;
}

function printPurchaseBill(p: Purchase) {
  const win = window.open("", "_blank", "width=800,height=600");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>Purchase Bill - ${p.purchase_number}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  body{font-family:'Inter',Arial,sans-serif;margin:0;padding:32px;color:#111;background:#fff}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:16px;margin-bottom:24px}
  .title{font-size:24px;font-weight:900;letter-spacing:-0.5px}
  .subtitle{font-size:11px;color:#666;margin-top:4px}
  .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:10px;font-weight:700;text-transform:uppercase;background:${p.status === "paid" ? "#dcfce7" : "#fef3c7"};color:${p.status === "paid" ? "#166534" : "#92400e"}}
  .section{margin-bottom:20px}
  .section-title{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#888;margin-bottom:8px}
  .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px}
  .row .label{color:#666}
  .row .value{font-weight:600}
  .total-row{display:flex;justify-content:space-between;padding:10px 0;font-size:16px;font-weight:900;border-top:2px solid #111;margin-top:8px}
  .amount{color:#dc2626;font-size:20px;font-weight:900}
  .footer{margin-top:40px;text-align:center;font-size:10px;color:#999}
</style></head><body>
<div class="header">
  <div><div class="title">Purchase Bill</div><div class="subtitle">${p.purchase_number}</div></div>
  <div style="text-align:right"><span class="badge">${p.status.toUpperCase()}</span><div style="font-size:11px;color:#666;margin-top:6px">${formatDate(p.date)}</div></div>
</div>
<div class="section">
  <div class="section-title">Vendor Details</div>
  <div class="row"><span class="label">Vendor Name</span><span class="value">${p.vendor_name}</span></div>
  ${p.vendors?.contact_person ? `<div class="row"><span class="label">Contact</span><span class="value">${p.vendors.contact_person}</span></div>` : ""}
  ${p.vendors?.email ? `<div class="row"><span class="label">Email</span><span class="value">${p.vendors.email}</span></div>` : ""}
  ${p.vendors?.phone ? `<div class="row"><span class="label">Phone</span><span class="value">${p.vendors.phone}</span></div>` : ""}
</div>
<div class="section">
  <div class="section-title">Purchase Details</div>
  <div class="row"><span class="label">Description</span><span class="value">${p.description}</span></div>
  <div class="row"><span class="label">Category</span><span class="value">${p.category}</span></div>
  <div class="row"><span class="label">Date</span><span class="value">${formatDate(p.date)}</span></div>
  ${p.notes ? `<div class="row"><span class="label">Notes</span><span class="value">${p.notes}</span></div>` : ""}
</div>
<div class="total-row"><span>Total Amount</span><span class="amount">−${formatCurrency(p.amount)}</span></div>
<div class="footer">Computer generated purchase bill &bull; ${new Date().toLocaleString()}</div>
</body></html>`);
  win.document.close();
  win.print();
}

/* ─── Main ───────────────────────────────────────────────────────────────── */

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [vendorSearch, setVendorSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"purchases" | "vendors">("purchases");

  /* dialogs */
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [paymentPurchase, setPaymentPurchase] = useState<Purchase | null>(null);
  const [sharePurchase, setSharePurchase] = useState<Purchase | null>(null);

  /* vendor edit/delete */
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [deletingVendorId, setDeletingVendorId] = useState<string | null>(null);
  const [confirmDeleteVendor, setConfirmDeleteVendor] = useState<Vendor | null>(null);

  /* forms */
  const [form, setForm] = useState(EMPTY_FORM);
  const [vendorForm, setVendorForm] = useState(EMPTY_VENDOR_FORM);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showLogView, setShowLogView] = useState(false);

  const [vendorPickerOpen, setVendorPickerOpen] = useState(false);
  const [empPickerOpen, setEmpPickerOpen] = useState(false);

  /* payment modal */
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([]);
  const [paymentRemarks, setPaymentRemarks] = useState("");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [receiptNumber] = useState(genReceiptNumber);

  /* row actions */
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [confirmDeletePurchase, setConfirmDeletePurchase] = useState<Purchase | null>(null);
  const [realtime, setRealtime] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [copied, setCopied] = useState(false);
  const [editedPurchaseIds, setEditedPurchaseIds] = useState<Set<string>>(new Set());
  const [editAuthMap, setEditAuthMap] = useState<Record<string, { name: string; empId: string }>>({});

  /* ── Load ─────────────────────────────────────────────────────────────── */

  const loadPurchases = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (filter !== "all") p.set("status", filter);
      if (search) p.set("search", search);
      const res = await fetch(`/api/purchases?${p}`);
      const json = await res.json();
      if (json.purchases) setPurchases(json.purchases);
    } catch {} finally { setLoading(false); }
  }, [filter, search]);

  const loadVendors = useCallback(async () => {
    setVendorsLoading(true);
    try {
      const res = await fetch("/api/vendors");
      const json = await res.json();
      if (json.vendors) setVendors(json.vendors);
    } catch {} finally { setVendorsLoading(false); }
  }, []);

  const loadEmployees = useCallback(async () => {
    try {
      const res = await fetch("/api/employees");
      const json = await res.json();
      if (json.employees) setEmployees(json.employees);
    } catch {}
  }, []);

  useEffect(() => { loadPurchases(); }, [loadPurchases]);
  useEffect(() => { loadVendors(); }, [loadVendors]);
  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  useEffect(() => {
    const ch = supabase.channel("purchases-rt-v3")
      .on("postgres_changes", { event: "*", schema: "public", table: "purchases" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setPurchases((prev) => prev.some(p => p.id === (payload.new as Purchase).id) ? prev : [payload.new as Purchase, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setPurchases((prev) => prev.map(p => p.id === payload.new.id ? { ...p, ...payload.new } : p));
        } else if (payload.eventType === "DELETE") {
          setPurchases((prev) => prev.filter(p => p.id !== payload.old.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "vendors" }, () => loadVendors())
      .subscribe((s) => {
        if (s === "SUBSCRIBED") setRealtime("connected");
        else if (s === "CLOSED" || s === "CHANNEL_ERROR") setRealtime("disconnected");
        else setRealtime("connecting");
      });
    return () => { supabase.removeChannel(ch); };
  }, [loadVendors]);

  /* ── Derived ─────────────────────────────────────────────────────────── */

  const totalSpend = purchases.reduce((s, p) => s + p.amount, 0);
  const thisMonth = purchases.filter(p => p.date?.startsWith(new Date().toISOString().slice(0, 7))).reduce((s, p) => s + p.amount, 0);
  const totalDues = purchases.filter(p => p.status === "pending").reduce((s, p) => s + p.amount, 0);
  const pendingCount = purchases.filter(p => p.status === "pending").length;
  const paidCount = purchases.filter(p => p.status === "paid").length;

  const filtered = useMemo(() => purchases.filter(p => {
    const q = search.toLowerCase();
    const ms = !search || p.vendor_name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || (p.purchase_number || "").toLowerCase().includes(q);
    return ms && (filter === "all" || p.status === filter);
  }), [purchases, search, filter]);

  const filteredVendors = useMemo(() => vendors.filter(v =>
    !vendorSearch || v.name.toLowerCase().includes(vendorSearch.toLowerCase()) ||
    v.category.toLowerCase().includes(vendorSearch.toLowerCase()) ||
    (v.contact_person || "").toLowerCase().includes(vendorSearch.toLowerCase())
  ), [vendors, vendorSearch]);

  const totalVendors = vendors.length;
  const totalVendorPaid = vendors.reduce((s, v) => s + v.total_paid, 0);
  const categoryCount = new Set(vendors.map(v => v.category)).size;
  const topVendor = vendors.reduce((a, b) => (a?.total_paid ?? 0) > (b?.total_paid ?? 0) ? a : b, vendors[0]);

  const payingNow = paymentRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const balanceDue = (paymentPurchase ? paymentPurchase.amount : 0) - payingNow;

  /* ── Actions ─────────────────────────────────────────────────────────── */

  async function handleSavePurchase(recordPayment = false) {
    if (!form.vendor_name || !form.description || !form.category || !form.amount || !form.date) return;
    setSaving(true);
    try {
      if (editingPurchase) {
        const res = await fetch(`/api/purchases/${editingPurchase.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendor_id: form.vendor_id || null, vendor_name: form.vendor_name,
            description: form.description, category: form.category,
            amount: form.amount, date: form.date, notes: form.notes || null,
          }),
        });
        const json = await res.json();
        if (json.purchase) {
          setPurchases(prev => prev.map(p => p.id === editingPurchase.id ? { ...p, ...json.purchase } : p));
          setEditedPurchaseIds(prev => new Set([...prev, editingPurchase.id]));
          if (selectedEmployee) {
            setEditAuthMap(prev => ({ ...prev, [editingPurchase.id]: { name: selectedEmployee.name, empId: selectedEmployee.employee_id } }));
          }
          toast.success("Purchase updated");
        }
        closePurchaseModal();
      } else {
        const res = await fetch("/api/purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendor_id: form.vendor_id || null, vendor_name: form.vendor_name,
            description: form.description, category: form.category,
            amount: form.amount, date: form.date, notes: form.notes || null, status: "pending",
            filed_by_emp_id: selectedEmployee?.employee_id || "",
            filed_by_name: selectedEmployee?.name || "",
            filed_by_dept: selectedEmployee?.department || "",
            filed_by_desig: selectedEmployee?.designation || "",
            filed_by_uuid: selectedEmployee?.id || null,
          }),
        });
        const json = await res.json();
        toast.success("Purchase added");
        closePurchaseModal();
        if (recordPayment && json.purchase) openPaymentModal(json.purchase as Purchase);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    setDeleteId(id);
    try {
      await fetch(`/api/purchases/${id}`, { method: "DELETE" });
      toast.success("Purchase deleted");
    } finally { setDeleteId(null); setConfirmDeletePurchase(null); }
  }

  function handleCreateInvoice(p: Purchase) {
    const params = new URLSearchParams({ type: "payable", vendor_id: p.vendor_id || "", vendor_name: p.vendor_name, description: p.description, amount: String(p.amount), purchase_id: p.id });
    window.location.href = `/admin/invoicing?${params}`;
  }

  function openPaymentModal(p: Purchase) {
    setPaymentPurchase(p);
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentRows([{ id: crypto.randomUUID(), mode: "Cash", amount: String(p.amount), reference: "" }]);
    setPaymentRemarks("");
  }

  function closePaymentModal() {
    setPaymentPurchase(null);
    setPaymentRows([]);
    setPaymentRemarks("");
  }

  function addPaymentMode(mode: PaymentRow["mode"]) {
    const remaining = (paymentPurchase?.amount || 0) - paymentRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    setPaymentRows(prev => [...prev, { id: crypto.randomUUID(), mode, amount: remaining > 0 ? String(remaining) : "", reference: "" }]);
  }

  function updatePaymentRow(id: string, field: keyof PaymentRow, value: string) {
    setPaymentRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  function removePaymentRow(id: string) {
    setPaymentRows(prev => {
      const next = prev.filter(r => r.id !== id);
      if (next.length > 0 && paymentPurchase) {
        const paid = next.slice(0, -1).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
        const rem = paymentPurchase.amount - paid;
        next[next.length - 1] = { ...next[next.length - 1], amount: rem > 0 ? String(rem) : "0" };
      }
      return next;
    });
  }

  async function handleConfirmPayment() {
    if (!paymentPurchase || payingNow <= 0) return;
    setPaymentSaving(true);
    try {
      await fetch(`/api/purchases/${paymentPurchase.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid" }),
      });
      toast.success("Payment recorded");
      closePaymentModal();
    } finally { setPaymentSaving(false); }
  }

  function openAddVendor() { setEditingVendor(null); setVendorForm(EMPTY_VENDOR_FORM); setShowVendorModal(true); }
  function openEditVendor(v: Vendor) {
    setEditingVendor(v);
    setVendorForm({ name: v.name, contact_person: v.contact_person || "", email: v.email || "", phone: v.phone || "", category: v.category, address: "", gstin: "" });
    setShowVendorModal(true);
  }

  async function handleSaveVendor() {
    if (!vendorForm.name) return;
    setSaving(true);
    try {
      if (editingVendor) {
        const res = await fetch(`/api/vendors/${editingVendor.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vendorForm),
        });
        const json = await res.json();
        if (json.vendor) {
          setVendors(prev => prev.map(v => v.id === editingVendor.id ? { ...v, ...json.vendor } : v));
          toast.success("Vendor updated");
        }
      } else {
        const res = await fetch("/api/vendors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vendorForm) });
        const json = await res.json();
        if (json.vendor) {
          const nv: Vendor = json.vendor;
          setVendors(prev => [...prev, nv].sort((a, b) => a.name.localeCompare(b.name)));
          if (showPurchaseModal) selectVendor(nv);
          toast.success("Vendor added");
        }
      }
      setVendorForm(EMPTY_VENDOR_FORM);
      setEditingVendor(null);
      setShowVendorModal(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save vendor");
    } finally { setSaving(false); }
  }

  async function handleDeleteVendor() {
    if (!confirmDeleteVendor) return;
    setDeletingVendorId(confirmDeleteVendor.id);
    try {
      await fetch(`/api/vendors/${confirmDeleteVendor.id}`, { method: "DELETE" });
      setVendors(prev => prev.filter(x => x.id !== confirmDeleteVendor.id));
      toast.success("Vendor deleted");
    } finally {
      setDeletingVendorId(null);
      setConfirmDeleteVendor(null);
    }
  }

  function selectVendor(v: Vendor) {
    setSelectedVendor(v);
    setForm(f => ({ ...f, vendor_id: v.id, vendor_name: v.name }));
    setVendorPickerOpen(false);
  }

  function openPurchaseModal() {
    setEditingPurchase(null); setForm(EMPTY_FORM); setSelectedVendor(null); setSelectedEmployee(null);
    setShowPurchaseModal(true);
  }
  function closePurchaseModal() {
    setEditingPurchase(null); setForm(EMPTY_FORM); setSelectedVendor(null); setSelectedEmployee(null);
    setShowPurchaseModal(false);
  }
  function openEditPurchase(p: Purchase) {
    setEditingPurchase(p);
    setForm({
      vendor_id: p.vendor_id || "", vendor_name: p.vendor_name,
      description: p.description, category: p.category,
      amount: String(p.amount), date: p.date, notes: p.notes || "",
    });
    const matched = vendors.find(v => v.id === p.vendor_id);
    setSelectedVendor(matched || null);
    setSelectedEmployee(null);
    setShowPurchaseModal(true);
  }

  function copyShareText(p: Purchase) {
    const text = `Purchase Bill: ${p.purchase_number}\nVendor: ${p.vendor_name}\nDescription: ${p.description}\nAmount: ${formatCurrency(p.amount)}\nDate: ${formatDate(p.date)}\nStatus: ${p.status.toUpperCase()}`;
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const formValid = !!form.vendor_name && !!form.description && !!form.category && !!form.amount && !!form.date && !!selectedEmployee;

  /* ── Render ──────────────────────────────────────────────────────────── */

  const purchaseStats = [
    { label: "Total Spend", value: formatCurrency(totalSpend), icon: IndianRupee,  tone: "text-foreground",  bg: "bg-muted" },
    { label: "This Month",  value: formatCurrency(thisMonth),  icon: ShoppingCart, tone: "text-sky-600",     bg: "bg-sky-500/10" },
    { label: "Total Dues",  value: formatCurrency(totalDues),  icon: AlertCircle,  tone: "text-rose-600",    bg: "bg-rose-500/10" },
    { label: "Pending",     value: String(pendingCount),       icon: Clock,        tone: "text-amber-600",   bg: "bg-amber-500/10" },
    { label: "Paid",        value: String(paidCount),          icon: CheckCircle2, tone: "text-emerald-600", bg: "bg-emerald-500/10" },
  ];

  const vendorStats = [
    { label: "Total Vendors",   value: String(totalVendors),                 icon: Building2,   tone: "text-foreground",  bg: "bg-muted" },
    { label: "Total Paid Out",  value: formatCurrency(totalVendorPaid),      icon: IndianRupee, tone: "text-rose-600",    bg: "bg-rose-500/10" },
    { label: "Categories",      value: String(categoryCount),                icon: Tag,         tone: "text-sky-600",     bg: "bg-sky-500/10" },
    { label: "Top Vendor",      value: topVendor?.name ?? "—",               icon: TrendingUp,  tone: "text-emerald-600", bg: "bg-emerald-500/10" },
  ];

  return (
    <DashboardShell
      moduleKey="vendors"
      title="Purchases & Vendors"
      subtitle="Record purchases, track payments, and manage your vendor directory."
      actions={
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs">
            <span className={cn("h-1.5 w-1.5 rounded-full",
              realtime === "connected" ? "bg-emerald-500 animate-pulse" :
              realtime === "connecting" ? "bg-amber-500 animate-pulse" : "bg-rose-500")} />
            <span className={cn("font-medium",
              realtime === "connected" ? "text-emerald-600" :
              realtime === "connecting" ? "text-amber-600" : "text-rose-500")}>
              {realtime === "connected" ? "Live" : realtime === "connecting" ? "Connecting" : "Offline"}
            </span>
          </span>
          <Button variant="outline" size="sm" onClick={activeTab === "purchases" ? loadPurchases : loadVendors}>
            <RefreshCw size={13} /> Refresh
          </Button>
          {activeTab === "purchases" && (
            <Button variant={showLogView ? "default" : "outline"} size="sm" onClick={() => setShowLogView(!showLogView)}>
              <BookOpen size={13} /> Log Sheet
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={openAddVendor}>
            <Building2 size={13} /> Add Vendor
          </Button>
          {activeTab === "purchases" && (
            <Button size="sm" onClick={openPurchaseModal}>
              <Plus size={13} /> Add Purchase
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="purchases" className="text-xs gap-1.5">
              <ShoppingCart size={11} /> Purchases
              <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{purchases.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="vendors" className="text-xs gap-1.5">
              <Building2 size={11} /> Vendors
              <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{vendors.length}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {activeTab === "purchases" && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              {purchaseStats.map(({ label, value, icon: Icon, tone, bg }) => (
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

            <Card className="p-0 overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <Tabs value={filter} onValueChange={setFilter}>
                  <TabsList>
                    <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                    <TabsTrigger value="pending" className="text-xs">Pending</TabsTrigger>
                    <TabsTrigger value="paid" className="text-xs">Paid</TabsTrigger>
                    <TabsTrigger value="cancelled" className="text-xs">Cancelled</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} />
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search purchases…" className="h-8 w-48 pl-8 text-xs" />
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      {showLogView && <TableHead>Filed By</TableHead>}
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: showLogView ? 8 : 7 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={showLogView ? 8 : 7} className="py-12 text-center text-sm text-muted-foreground">
                          No purchases found
                        </TableCell>
                      </TableRow>
                    ) : filtered.map(p => (
                      <TableRow key={p.id} className="group">
                        <TableCell>
                          <p className="text-sm font-medium text-foreground">{p.vendor_name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-xs text-muted-foreground tabular-nums">{p.purchase_number}</p>
                            {editedPurchaseIds.has(p.id) && (
                              <Badge variant="outline" className="text-amber-600 border-amber-500/30 bg-amber-500/10 gap-0.5 h-4 px-1.5 text-[9px]">
                                <Pencil size={8} /> Edited
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{p.description}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("gap-1", CATEGORY_TONE[p.category])}>
                            <Tag size={10} /> {p.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-semibold text-rose-500 tabular-nums">−{formatCurrency(p.amount)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(p.date)}</TableCell>
                        <TableCell>{statusBadge(p.status)}</TableCell>
                        {showLogView && (
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-7 w-7">
                                <AvatarFallback className="text-[10px] font-semibold">{initials(p.filed_by_name)}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-xs font-medium text-foreground leading-none">{p.filed_by_name || "System"}</p>
                                <p className="text-[10px] text-muted-foreground tabular-nums mt-1">{p.filed_by_emp_id || "—"}</p>
                              </div>
                            </div>
                            {editAuthMap[p.id] && (
                              <div className="mt-2 flex items-center gap-2 border-t border-dashed border-amber-500/30 pt-2">
                                <Avatar className="h-7 w-7">
                                  <AvatarFallback className="text-[10px] font-semibold bg-amber-500/10 text-amber-600">{initials(editAuthMap[p.id].name)}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-[10px] font-medium text-amber-600 flex items-center gap-1 leading-none">
                                    <Pencil size={8} /> Edited
                                  </p>
                                  <p className="text-xs font-medium text-foreground mt-1">{editAuthMap[p.id].name}</p>
                                  <p className="text-[10px] text-muted-foreground tabular-nums">{editAuthMap[p.id].empId}</p>
                                </div>
                              </div>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {p.status === "pending" && (
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10" title="Record Payment" onClick={() => openPaymentModal(p)}>
                                <CreditCard size={13} />
                              </Button>
                            )}
                            {!p.invoice_id && (
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Create payable invoice" onClick={() => handleCreateInvoice(p)}>
                                <FileText size={13} />
                              </Button>
                            )}
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Share" onClick={() => setSharePurchase(p)}>
                              <Share2 size={13} />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Print / Download" onClick={() => printPurchaseBill(p)}>
                              <Download size={13} />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openEditPurchase(p)}>
                              <Pencil size={13} />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10" title="Delete" onClick={() => setConfirmDeletePurchase(p)}>
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-2.5">
                <span className="text-xs text-muted-foreground">{filtered.length} purchase{filtered.length !== 1 ? "s" : ""}</span>
                <span className="text-xs text-muted-foreground">
                  Total: <span className="font-semibold text-foreground tabular-nums">{formatCurrency(filtered.reduce((s, p) => s + p.amount, 0))}</span>
                </span>
              </div>
            </Card>
          </>
        )}

        {activeTab === "vendors" && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {vendorStats.map(({ label, value, icon: Icon, tone, bg }) => (
                <Card key={label}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg", bg)}>
                      <Icon size={15} className={tone} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className={cn("text-xl font-semibold tabular-nums leading-tight truncate", tone)}>{value}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="p-0 overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-foreground">Vendor Directory</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} />
                  <Input value={vendorSearch} onChange={e => setVendorSearch(e.target.value)} placeholder="Search vendors…" className="h-8 w-48 pl-8 text-xs" />
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Total Paid</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendorsLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 8 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : filteredVendors.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-16 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted"><Building2 size={20} className="text-muted-foreground" /></div>
                            <p className="text-sm text-muted-foreground">{vendorSearch ? "No vendors match your search" : "No vendors yet"}</p>
                            {!vendorSearch && <Button size="sm" onClick={openAddVendor}><Plus size={12} /> Add First Vendor</Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filteredVendors.map(v => (
                      <TableRow key={v.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-[10px] font-semibold bg-sky-500/10 text-sky-600">{initials(v.name)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium text-foreground">{v.name}</p>
                              <p className="text-xs text-muted-foreground tabular-nums">VEN-{v.id.slice(0, 8).toUpperCase()}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("gap-1", CATEGORY_TONE[v.category])}>
                            <Tag size={10} /> {v.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {v.contact_person ? (
                            <div className="flex items-center gap-1.5 text-xs text-foreground"><User size={11} className="text-muted-foreground" /> {v.contact_person}</div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {v.email ? (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Mail size={11} />
                              <span className="truncate max-w-[160px]">{v.email}</span>
                            </div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {v.phone ? (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone size={11} /> {v.phone}</div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className={cn("text-sm font-semibold tabular-nums", v.total_paid > 0 ? "text-rose-500" : "text-muted-foreground")}>
                          {v.total_paid > 0 ? `−${formatCurrency(v.total_paid)}` : "₹0"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(v.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Edit vendor" onClick={() => openEditVendor(v)}>
                              <Pencil size={13} />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10" title="Delete vendor" onClick={() => setConfirmDeleteVendor(v)}>
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-2.5">
                <span className="text-xs text-muted-foreground">{filteredVendors.length} vendor{filteredVendors.length !== 1 ? "s" : ""}</span>
                <span className="text-xs text-muted-foreground">
                  Total paid out: <span className="font-semibold text-foreground tabular-nums">{formatCurrency(filteredVendors.reduce((s, v) => s + v.total_paid, 0))}</span>
                </span>
              </div>
            </Card>
          </>
        )}
      </div>

      {/* ── Purchase Bill Dialog ───────────────────────────────────────── */}
      <Dialog open={showPurchaseModal} onOpenChange={(o) => { if (!o) closePurchaseModal(); }}>
        <DialogContent className="sm:max-w-3xl !grid-rows-[auto_1fr_auto] !grid p-0 overflow-hidden gap-0 max-h-[calc(100vh-4rem)] sm:max-h-[88vh]">
          <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-6 py-4">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0",
              editingPurchase ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary")}>
              {editingPurchase ? <Pencil size={16} /> : <Receipt size={16} />}
            </div>
            <div className="flex-1 text-left">
              <DialogTitle className="text-sm font-semibold">{editingPurchase ? "Edit Purchase Bill" : "New Purchase Bill"}</DialogTitle>
              <DialogDescription className="text-xs">
                {editingPurchase ? `Editing ${editingPurchase.purchase_number}` : "Finance & Procurement log"}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto">
            {/* Authorization strip */}
            <div className={cn("border-b border-border px-6 py-4",
              selectedEmployee ? "bg-emerald-500/5" : "bg-muted/30")}>
              <div className="flex items-center gap-3">
                <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0",
                  selectedEmployee ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground")}>
                  {selectedEmployee ? <CheckCircle2 size={15} /> : <User size={14} />}
                </div>

                {!selectedEmployee ? (
                  <Popover open={empPickerOpen} onOpenChange={setEmpPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="flex-1 justify-between font-normal">
                        <span className="text-muted-foreground">
                          {editingPurchase ? "Select authorising employee for this edit…" : "Select filing employee to authorise…"}
                        </span>
                        <ChevronsUpDown size={13} className="opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[400px]" align="start">
                      <Command>
                        <CommandInput placeholder="Search employee…" />
                        <CommandList>
                          <CommandEmpty>No employees found.</CommandEmpty>
                          <CommandGroup>
                            {employees.map(e => (
                              <CommandItem key={e.id} value={`${e.name} ${e.employee_id}`} onSelect={() => { setSelectedEmployee(e); setEmpPickerOpen(false); }}>
                                <Avatar className="h-7 w-7 mr-2.5"><AvatarFallback className="text-[10px] font-semibold">{initials(e.name)}</AvatarFallback></Avatar>
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{e.name}</p>
                                  <p className="text-xs text-muted-foreground tabular-nums">{e.employee_id} · {e.department}</p>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <div className="flex flex-1 items-center gap-3 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-emerald-500 hover:bg-emerald-500/90 text-white">{editingPurchase ? "Edit authorised" : "Authenticated"}</Badge>
                        <span className="text-xs text-muted-foreground tabular-nums">{selectedEmployee.employee_id}</span>
                      </div>
                      <p className="text-sm font-medium text-foreground mt-0.5">{selectedEmployee.name}</p>
                      <p className="text-xs text-muted-foreground">{selectedEmployee.designation} · {selectedEmployee.department}</p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setSelectedEmployee(null)}>Change</Button>
                  </div>
                )}
              </div>
            </div>

            <div className={cn("p-6 grid grid-cols-1 md:grid-cols-2 gap-6 transition-opacity",
              !selectedEmployee ? "opacity-40 pointer-events-none select-none" : "")}>

              {/* LEFT */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Building2 size={11} /> Vendor Details
                  </p>
                  <Button type="button" variant="link" size="sm" className="text-xs h-auto p-0" onClick={openAddVendor}>
                    <Plus size={10} /> New Vendor
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Select Vendor *</Label>
                  <Popover open={vendorPickerOpen} onOpenChange={setVendorPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        <span className={selectedVendor ? "text-foreground" : "text-muted-foreground"}>
                          {selectedVendor ? selectedVendor.name : form.vendor_name || "Search or type vendor name…"}
                        </span>
                        <ChevronsUpDown size={13} className="opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[400px]" align="start">
                      <Command>
                        <CommandInput placeholder="Search vendor…" />
                        <CommandList>
                          <CommandEmpty>No vendors found.</CommandEmpty>
                          <CommandGroup>
                            {vendors.map(v => (
                              <CommandItem key={v.id} value={`${v.name} ${v.contact_person ?? ""}`} onSelect={() => selectVendor(v)}>
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{v.name}</p>
                                  {v.contact_person && <p className="text-xs text-muted-foreground">{v.contact_person}</p>}
                                </div>
                                <Badge variant="outline" className={cn("text-[10px]", CATEGORY_TONE[v.category])}>{v.category}</Badge>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Input
                    value={form.vendor_name}
                    onChange={(e) => { setForm(f => ({ ...f, vendor_name: e.target.value, vendor_id: "" })); setSelectedVendor(null); }}
                    placeholder="Or type a custom vendor name…"
                    className="text-xs"
                  />
                </div>

                {selectedVendor ? (
                  <Card>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">{selectedVendor.name}</p>
                        <Badge variant="outline" className={cn("text-[10px]", CATEGORY_TONE[selectedVendor.category])}>{selectedVendor.category}</Badge>
                      </div>
                      <div className="space-y-1.5 text-xs text-muted-foreground">
                        {selectedVendor.contact_person && <div className="flex items-center gap-2"><User size={11} /> {selectedVendor.contact_person}</div>}
                        {selectedVendor.email && <div className="flex items-center gap-2"><Mail size={11} /> {selectedVendor.email}</div>}
                        {selectedVendor.phone && <div className="flex items-center gap-2"><Phone size={11} /> {selectedVendor.phone}</div>}
                        <Separator />
                        <div className="flex items-center justify-between">
                          <span>Total Paid</span>
                          <span className="font-semibold text-foreground tabular-nums">{formatCurrency(selectedVendor.total_paid)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-dashed">
                    <CardContent className="p-6 text-center space-y-2">
                      <Building2 size={22} className="mx-auto text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Pick a vendor above, or type a custom name.</p>
                    </CardContent>
                  </Card>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">Notes / Remarks</Label>
                  <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3}
                    placeholder="Any additional remarks…" className="resize-none" />
                </div>
              </div>

              {/* RIGHT */}
              <div className="space-y-4">
                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <ShoppingCart size={11} /> Purchase Details
                </p>

                <div className="space-y-1.5">
                  <Label className="text-xs">Description *</Label>
                  <div className="relative">
                    <Layers size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g. EC2 + S3 monthly bill" className="pl-9" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Category *</Label>
                  <Select value={form.category || undefined} onValueChange={v => setForm({ ...form, category: v })}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select category…" /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Amount (₹) *</Label>
                  <div className="relative">
                    <IndianRupee size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" className="pl-9 tabular-nums" />
                  </div>
                  {form.amount && Number(form.amount) > 0 && (
                    <p className="text-xs font-medium text-rose-500 tabular-nums">−{formatCurrency(Number(form.amount))} expense</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Purchase Date *</Label>
                  <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                </div>

                {formValid && (
                  <Card>
                    <CardContent className="p-4 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">Bill Summary</p>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between"><span className="text-muted-foreground">Vendor</span><span className="font-medium text-foreground">{form.vendor_name}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Category</span><span className="font-medium text-foreground">{form.category}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium text-foreground">{formatDate(form.date)}</span></div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="font-semibold text-foreground">Total Due</span>
                          <span className="font-semibold text-rose-500 text-sm tabular-nums">−{formatCurrency(Number(form.amount))}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="!mx-0 !mb-0 !rounded-none flex-row items-center sm:justify-between gap-2 border-t border-border bg-background px-6 py-4">
            <p className="text-xs text-muted-foreground hidden sm:block">
              {editingPurchase ? "Status unchanged when editing" : "Saved bills are marked Due until paid"}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={closePurchaseModal}>Cancel</Button>
              {editingPurchase ? (
                <Button type="button" size="sm" disabled={saving || !formValid} onClick={() => handleSavePurchase(false)}>
                  {saving && <Loader2 size={12} className="animate-spin" />} Save Changes
                </Button>
              ) : (
                <>
                  <Button type="button" variant="outline" size="sm" disabled={saving || !formValid} onClick={() => handleSavePurchase(false)}>
                    {saving && <Loader2 size={12} className="animate-spin" />} Save Bill
                  </Button>
                  <Button type="button" size="sm" disabled={saving || !formValid} onClick={() => handleSavePurchase(true)}>
                    {saving && <Loader2 size={12} className="animate-spin" />} Save &amp; Record Payment
                  </Button>
                </>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Payment Modal ──────────────────────────────────────────────── */}
      <Dialog open={!!paymentPurchase} onOpenChange={(o) => { if (!o) closePaymentModal(); }}>
        <DialogContent className="sm:max-w-3xl !grid-rows-[auto_1fr_auto] !grid p-0 overflow-hidden gap-0 max-h-[calc(100vh-4rem)] sm:max-h-[88vh]">
          <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 flex-shrink-0">
                <CreditCard size={16} />
              </div>
              <div className="text-left">
                <DialogTitle className="text-sm font-semibold">Record Payment</DialogTitle>
                <DialogDescription className="text-xs">Complete the transaction for this purchase bill</DialogDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">Receipt # {receiptNumber}</Badge>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto p-6 space-y-5">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5"><CalendarDays size={11} /> Payment Date</Label>
              <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="w-fit" />
            </div>

            <div className="space-y-3">
              <Label className="text-xs flex items-center gap-1.5"><CreditCard size={11} /> Payment Details</Label>
              {paymentRows.map((row) => {
                const modeInfo = PAYMENT_MODES.find(m => m.mode === row.mode)!;
                const ModeIcon = modeInfo?.icon || Banknote;
                return (
                  <Card key={row.id}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md", modeInfo.tone)}>
                        <ModeIcon size={15} />
                      </div>
                      <div className="flex-shrink-0 w-24">
                        <p className="text-xs font-medium text-foreground">{row.mode}</p>
                        <p className="text-[10px] text-muted-foreground">Method</p>
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs text-muted-foreground">Amount</Label>
                        <div className="relative">
                          <IndianRupee size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input type="number" value={row.amount} onChange={e => updatePaymentRow(row.id, "amount", e.target.value)} className="h-8 pl-7 tabular-nums" />
                        </div>
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs text-muted-foreground">Reference (optional)</Label>
                        <Input value={row.reference} placeholder="Ref No." onChange={e => updatePaymentRow(row.id, "reference", e.target.value)} className="h-8" />
                      </div>
                      {paymentRows.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:bg-rose-500/10" onClick={() => removePaymentRow(row.id)}>
                          <X size={14} />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Add Payment Mode</p>
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_MODES.map(({ mode, icon: MIcon, tone }) => (
                    <Button key={mode} type="button" variant="outline" size="sm" onClick={() => addPaymentMode(mode)}
                      className={cn("gap-1.5", tone)}>
                      <MIcon size={12} /> {mode} <Plus size={10} className="opacity-60" />
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Message / Remarks</Label>
              <Textarea value={paymentRemarks} onChange={e => setPaymentRemarks(e.target.value)} rows={2} placeholder="Add payment remarks here…" className="resize-none" />
            </div>

            {paymentPurchase && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground">Transaction Summary</p>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sky-500/10 text-sky-600">
                      <Building2 size={15} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Vendor</p>
                      <p className="text-sm font-medium text-foreground">{paymentPurchase.vendor_name}</p>
                    </div>
                  </div>
                  {paymentPurchase.description && <p className="text-xs text-muted-foreground border-t border-border pt-2 truncate">{paymentPurchase.description}</p>}
                  <Separator />
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Purchase Amount</span>
                      <span className="font-medium text-foreground tabular-nums">{formatCurrency(paymentPurchase.amount)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Paying Now</span>
                      <span className="font-medium text-rose-500 tabular-nums">−{formatCurrency(payingNow)}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">Balance Due</span>
                      <span className={cn("text-lg font-semibold tabular-nums", balanceDue <= 0 ? "text-emerald-600" : "text-amber-600")}>
                        {formatCurrency(Math.max(0, balanceDue))}
                      </span>
                    </div>
                  </div>
                  {balanceDue <= 0 && payingNow > 0 && (
                    <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                      <CheckCircle size={14} className="text-emerald-600 flex-shrink-0" />
                      <p className="text-xs font-medium text-emerald-700">Purchase will be marked as <span className="font-semibold">Paid</span></p>
                    </div>
                  )}
                  {balanceDue > 0 && payingNow > 0 && (
                    <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                      <AlertCircle size={14} className="text-amber-600 flex-shrink-0" />
                      <p className="text-xs font-medium text-amber-700">{formatCurrency(balanceDue)} balance remaining</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <DialogFooter className="!mx-0 !mb-0 !rounded-none flex-row items-center sm:justify-end gap-2 border-t border-border bg-background px-6 py-4">
            <Button type="button" variant="outline" size="sm" onClick={closePaymentModal}>Cancel</Button>
            <Button type="button" size="sm" className="bg-emerald-500 hover:bg-emerald-500/90" disabled={paymentSaving || payingNow <= 0} onClick={handleConfirmPayment}>
              {paymentSaving ? <Loader2 size={12} className="animate-spin" /> : <CreditCard size={12} />}
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Vendor Dialog ──────────────────────────────────────────────── */}
      <Dialog open={showVendorModal} onOpenChange={(o) => { if (!o) { setShowVendorModal(false); setVendorForm(EMPTY_VENDOR_FORM); setEditingVendor(null); } }}>
        <DialogContent className="sm:max-w-2xl !grid-rows-[auto_1fr_auto] !grid p-0 overflow-hidden gap-0 max-h-[calc(100vh-4rem)] sm:max-h-[88vh]">
          <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-6 py-4">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0",
              editingVendor ? "bg-amber-500/10 text-amber-600" : "bg-sky-500/10 text-sky-600")}>
              {editingVendor ? <Pencil size={16} /> : <Building2 size={16} />}
            </div>
            <div className="flex-1 text-left">
              <DialogTitle className="text-sm font-semibold">{editingVendor ? "Edit Vendor" : "Add New Vendor"}</DialogTitle>
              <DialogDescription className="text-xs">
                {editingVendor ? `Editing: ${editingVendor.name}` : "Register a vendor or supplier"}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto px-6 py-5 space-y-5">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Building2 size={11} /> Business Identity
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Vendor / Company Name *</Label>
                  <Input value={vendorForm.name} onChange={e => setVendorForm({ ...vendorForm, name: e.target.value })} placeholder="e.g. AWS India Pvt. Ltd." />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Select value={vendorForm.category} onValueChange={v => setVendorForm({ ...vendorForm, category: v })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">GSTIN (optional)</Label>
                  <Input value={vendorForm.gstin} onChange={e => setVendorForm({ ...vendorForm, gstin: e.target.value })} placeholder="29ABCDE1234F1Z5" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Address</Label>
                  <Input value={vendorForm.address} onChange={e => setVendorForm({ ...vendorForm, address: e.target.value })} placeholder="Street, City, State, Pincode" />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <User size={11} /> Contact Details
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Contact Person</Label>
                  <Input value={vendorForm.contact_person} onChange={e => setVendorForm({ ...vendorForm, contact_person: e.target.value })} placeholder="John Doe" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={vendorForm.email} onChange={e => setVendorForm({ ...vendorForm, email: e.target.value })} placeholder="vendor@company.com" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input value={vendorForm.phone} onChange={e => setVendorForm({ ...vendorForm, phone: e.target.value })} placeholder="+91 98765 43210" />
                </div>
              </div>
            </div>

            {vendorForm.name && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Preview</p>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{vendorForm.name}</p>
                      {vendorForm.contact_person && <p className="text-xs text-muted-foreground mt-0.5">{vendorForm.contact_person}</p>}
                      {vendorForm.email && <p className="text-xs text-muted-foreground">{vendorForm.email}</p>}
                      {vendorForm.phone && <p className="text-xs text-muted-foreground">{vendorForm.phone}</p>}
                    </div>
                    <Badge variant="outline" className={cn(CATEGORY_TONE[vendorForm.category])}>{vendorForm.category}</Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <DialogFooter className="!mx-0 !mb-0 !rounded-none flex-row items-center sm:justify-between gap-2 border-t border-border bg-background px-6 py-4">
            <p className="text-xs text-muted-foreground hidden sm:block">
              {editingVendor ? "Changes reflect across all linked purchases" : "Available for all future purchases"}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => { setShowVendorModal(false); setVendorForm(EMPTY_VENDOR_FORM); setEditingVendor(null); }}>Cancel</Button>
              <Button type="button" size="sm" disabled={saving || !vendorForm.name} onClick={handleSaveVendor}>
                {saving && <Loader2 size={12} className="animate-spin" />}
                {editingVendor ? "Save Changes" : "Add Vendor"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Share Dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!sharePurchase} onOpenChange={(o) => !o && setSharePurchase(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="flex-row items-center gap-3 space-y-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 flex-shrink-0">
              <Share2 size={16} />
            </div>
            <div className="text-left">
              <DialogTitle className="text-sm font-semibold">Share Purchase Bill</DialogTitle>
              <DialogDescription className="text-xs">{sharePurchase?.purchase_number}</DialogDescription>
            </div>
          </DialogHeader>
          {sharePurchase && (
            <>
              <Card>
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Bill No.</span><span className="tabular-nums font-medium text-foreground">{sharePurchase.purchase_number}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Vendor</span><span className="font-medium text-foreground">{sharePurchase.vendor_name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Description</span><span className="font-medium text-foreground max-w-[180px] truncate text-right">{sharePurchase.description}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold text-rose-500 tabular-nums">−{formatCurrency(sharePurchase.amount)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium text-foreground">{formatDate(sharePurchase.date)}</span></div>
                  <Separator />
                  <div className="flex justify-between"><span className="text-muted-foreground">Status</span>{statusBadge(sharePurchase.status)}</div>
                </CardContent>
              </Card>
              <DialogFooter className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => copyShareText(sharePurchase)}>
                  {copied ? <><CheckCircle size={14} className="text-emerald-500" /> Copied</> : <><Copy size={14} /> Copy</>}
                </Button>
                <Button type="button" onClick={() => { printPurchaseBill(sharePurchase); setSharePurchase(null); }}>
                  <Printer size={14} /> Print / PDF
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirms ────────────────────────────────────────────── */}
      <AlertDialog open={!!confirmDeletePurchase} onOpenChange={(o) => !o && setConfirmDeletePurchase(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete purchase?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">&ldquo;{confirmDeletePurchase?.purchase_number}&rdquo;</span> will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (confirmDeletePurchase) handleDelete(confirmDeletePurchase.id); }} className="bg-destructive text-white hover:bg-destructive/90">
              {deleteId === confirmDeletePurchase?.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDeleteVendor} onOpenChange={(o) => !o && setConfirmDeleteVendor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vendor?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">&ldquo;{confirmDeleteVendor?.name}&rdquo;</span> will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDeleteVendor(); }} className="bg-destructive text-white hover:bg-destructive/90">
              {deletingVendorId === confirmDeleteVendor?.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  );
}
