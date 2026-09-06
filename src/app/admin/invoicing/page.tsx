"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useState, useCallback, useContext, createContext } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { usePermission } from "@/hooks/usePermission";
import {
  FileText, Plus, Search, Download, IndianRupee, Clock,
  CheckCircle2, AlertCircle, Send, Eye, Mail,
  Building2, Folder, Users, Trash2,
  Settings, Shield, Zap, FlaskConical, Save, Lock, AlertTriangle, User,
  ChevronsUpDown, Loader2,
} from "lucide-react";
import { validateGSTIN, extractPANFromGSTIN } from "@/lib/gst";

// ─── Types ──────────────────────────────────────────────────────────────────
interface LineItem {
  id: string; description: string; hsn_sac: string;
  quantity: number; rate: number; gst_rate: number;
  amount: number; cgst_amount: number; sgst_amount: number; igst_amount: number; total: number;
}
interface Invoice {
  id: string; invoice_number: string;
  client_id: string | null; project_id: string | null; team_id: string | null;
  issued_date: string | null; due_date: string | null;
  status: "draft" | "sent" | "paid" | "overdue" | "error";
  subtotal: number; cgst: number; sgst: number; igst: number; tax: number; total: number; amount: number;
  notes: string | null; terms: string | null; bank_details: string | null;
  billing_address: string | null; client_gstin: string | null; client_email: string | null;
  place_of_supply: string | null;
  clients?: { id: string; name: string; email: string; company: string } | null;
  projects?: { id: string; name: string } | null;
  teams?: { id: string; name: string } | null;
  invoice_items?: LineItem[];
  created_by_emp_id?: string | null;
  created_by_name?: string | null;
  created_by_dept?: string | null;
  created_by_team?: string | null;
  created_by_desig?: string | null;
}
interface Client { id: string; name: string; email?: string; company?: string; lead_name?: string; gstin?: string; pan?: string; address?: string; }
interface Project { id: string; name: string; client_id?: string; teamIds?: string[]; issued_date?: string; due_date?: string; }
interface Team { id: string; name: string; }
interface Employee {
  id: string; employee_id: string; name: string;
  department: string | null; designation: string | null; team_id: string | null;
  teams?: { name: string } | null;
}
interface InvoiceSettings {
  id?: string;
  company_name: string; gstin: string; pan: string; address: string;
  city: string; state: string; pincode: string; phone: string; email: string;
  bank_name: string; bank_account: string; bank_ifsc: string; bank_branch: string;
  default_terms: string;
  smtp_host: string; smtp_port: number; smtp_user: string; smtp_pass: string;
  smtp_from_name: string; smtp_from_email: string; smtp_secure: boolean;
  invoice_prefix: string; default_due_days: number; invoice_footer: string;
  auto_numbering: boolean; show_logo: boolean; default_gst_rate: number;
  default_place_of_supply: string; require_approval: boolean; send_on_create: boolean;
  can_create_roles: string[]; can_send_roles: string[]; can_mark_paid_roles: string[];
  can_delete_roles: string[]; can_edit_roles: string[];
}

const ALL_ROLES = [
  { value: "admin",    label: "Admin",    color: "text-purple-700 border-purple-500/30 bg-purple-500/10" },
  { value: "hr",       label: "HR",       color: "text-sky-700 border-sky-500/30 bg-sky-500/10" },
  { value: "accounts", label: "Accounts", color: "text-emerald-700 border-emerald-500/30 bg-emerald-500/10" },
  { value: "dept_lead", label: "Department Lead", color: "text-purple-700 border-purple-500/30 bg-purple-500/10" },
  { value: "team_lead", label: "Team Lead",       color: "text-emerald-700 border-emerald-500/30 bg-emerald-500/10" },
  { value: "employee", label: "Employee", color: "" },
  { value: "intern",   label: "Intern",   color: "text-indigo-700 border-indigo-500/30 bg-indigo-500/10" },
];

const INDIAN_STATES_WITH_CODES = [
  { name: "Jammu & Kashmir", code: "01" }, { name: "Himachal Pradesh", code: "02" }, { name: "Punjab", code: "03" },
  { name: "Chandigarh", code: "04" }, { name: "Uttarakhand", code: "05" }, { name: "Haryana", code: "06" },
  { name: "Delhi", code: "07" }, { name: "Rajasthan", code: "08" }, { name: "Uttar Pradesh", code: "09" },
  { name: "Bihar", code: "10" }, { name: "Sikkim", code: "11" }, { name: "Arunachal Pradesh", code: "12" },
  { name: "Nagaland", code: "13" }, { name: "Manipur", code: "14" }, { name: "Mizoram", code: "15" },
  { name: "Tripura", code: "16" }, { name: "Meghalaya", code: "17" }, { name: "Assam", code: "18" },
  { name: "West Bengal", code: "19" }, { name: "Jharkhand", code: "20" }, { name: "Odisha", code: "21" },
  { name: "Chhattisgarh", code: "22" }, { name: "Madhya Pradesh", code: "23" }, { name: "Gujarat", code: "24" },
  { name: "Daman and Diu / Dadra and Nagar Haveli", code: "25" }, { name: "Dadra and Nagar Haveli and Daman and Diu", code: "26" },
  { name: "Maharashtra", code: "27" }, { name: "Andhra Pradesh (Old)", code: "28" }, { name: "Karnataka", code: "29" },
  { name: "Goa", code: "30" }, { name: "Lakshadweep", code: "31" }, { name: "Kerala", code: "32" },
  { name: "Tamil Nadu", code: "33" }, { name: "Puducherry", code: "34" }, { name: "Andaman and Nicobar Islands", code: "35" },
  { name: "Telangana", code: "36" }, { name: "Andhra Pradesh", code: "37" },
];

const EMPTY_SETTINGS: InvoiceSettings = {
  company_name: "", gstin: "", pan: "", address: "", city: "", state: "", pincode: "", phone: "", email: "",
  bank_name: "", bank_account: "", bank_ifsc: "", bank_branch: "",
  default_terms: "Payment due within 30 days.\nLate payment may attract 1.5% monthly interest.",
  smtp_host: "", smtp_port: 587, smtp_user: "", smtp_pass: "", smtp_from_name: "", smtp_from_email: "", smtp_secure: false,
  invoice_prefix: "INV", default_due_days: 30, invoice_footer: "Thank you for your business.", auto_numbering: true, show_logo: true,
  default_gst_rate: 18, default_place_of_supply: "Karnataka", require_approval: false, send_on_create: false,
  can_create_roles: ["admin"], can_send_roles: ["admin"],
  can_mark_paid_roles: ["admin"], can_delete_roles: ["admin"], can_edit_roles: ["admin"],
};

const GST_RATES = [0, 5, 12, 18, 28];
const round = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string | null | undefined): string => {
  if (!d) return "—";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
};

function statusBadge(status: Invoice["status"]) {
  if (status === "paid")    return <Badge className="bg-emerald-500 hover:bg-emerald-500/90 text-white capitalize">{status}</Badge>;
  if (status === "sent")    return <Badge className="bg-sky-500 hover:bg-sky-500/90 text-white capitalize">{status}</Badge>;
  if (status === "overdue") return <Badge variant="destructive" className="capitalize">{status}</Badge>;
  if (status === "error")   return <Badge variant="destructive" className="capitalize">{status}</Badge>;
  return <Badge variant="secondary" className="capitalize">{status}</Badge>;
}

// ─── Settings context ──────────────────────────────────────────────────────
const SettingsCtx = createContext<InvoiceSettings>(EMPTY_SETTINGS);

// ─── toWords / amountInWords helpers (preserved) ───────────────────────────
function toWords(n: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  if (n === 0) return "Zero";
  const crores = Math.floor(n / 10000000);
  const lakhs = Math.floor((n % 10000000) / 100000);
  const thousands = Math.floor((n % 100000) / 1000);
  const hundreds = Math.floor((n % 1000) / 100);
  const rest = n % 100;
  let w = "";
  const twoDigit = (x: number) => x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? " " + ones[x % 10] : "");
  if (crores) w += twoDigit(crores) + " Crore ";
  if (lakhs) w += twoDigit(lakhs) + " Lakh ";
  if (thousands) w += twoDigit(thousands) + " Thousand ";
  if (hundreds) w += ones[hundreds] + " Hundred ";
  if (rest) w += twoDigit(rest);
  return w.trim();
}
function amountInWords(total: number): string {
  const rupees = Math.floor(total);
  const paise = Math.round((total - rupees) * 100);
  let s = "INR " + toWords(rupees) + " Rupees";
  if (paise > 0) s += " and " + toWords(paise) + " Paise";
  return s + " Only";
}

// ─── A4 Invoice (HTML for Puppeteer PDF — preserved exactly) ───────────────
function A4Invoice({ inv, items, id = "a4-invoice" }: { inv: any; items: LineItem[]; id?: string; }) {
  const s = useContext(SettingsCtx);
  const subtotalExact = items.reduce((sum, i) => sum + (i.amount || 0), 0);
  const cgstExact = items.reduce((sum, i) => sum + (i.cgst_amount || 0), 0);
  const sgstExact = items.reduce((sum, i) => sum + (i.sgst_amount || 0), 0);
  const igstExact = items.reduce((sum, i) => sum + (i.igst_amount || 0), 0);
  const subtotal = round(subtotalExact);
  const cgst = round(cgstExact);
  const sgst = round(sgstExact);
  const igst = round(igstExact);
  const totalBeforeRounding = subtotalExact + cgstExact + sgstExact + igstExact;
  const total = round(totalBeforeRounding);
  const roundOff = total - totalBeforeRounding;
  const isIGST = igstExact > 0;

  const companyName = s.company_name || "Your Company Name";
  const companyGstin = s.gstin || "—";
  const companyPan = s.pan || "—";
  const companyAddr = [s.address, s.city, s.state, s.pincode].filter(Boolean).join(", ") || "—";
  const companyPhone = s.phone || "—";
  const companyEmail = s.email || "—";

  const rateMap: Record<number, { taxable: number; cgst: number; sgst: number; igst: number }> = {};
  items.forEach(i => {
    if (!rateMap[i.gst_rate]) rateMap[i.gst_rate] = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    rateMap[i.gst_rate].taxable += i.amount || 0;
    rateMap[i.gst_rate].cgst += i.cgst_amount || 0;
    rateMap[i.gst_rate].sgst += i.sgst_amount || 0;
    rateMap[i.gst_rate].igst += i.igst_amount || 0;
  });

  const cell = "border border-gray-300 px-2 py-1.5";
  const hcell = `${cell} bg-blue-900 text-white font-bold text-[9px] uppercase tracking-wide`;
  const PX = { h: "794px", v: "1123px" };

  return (
    <div id={id} style={{ width: PX.h, height: PX.v, backgroundColor: "#fff", fontFamily: "'Inter', Arial, sans-serif", color: "#1a1a2e", fontSize: "11px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ background: "linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 65%,#3b82f6 100%)", padding: "18px 28px 14px", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: "24px", fontWeight: 900, color: "#fff", letterSpacing: "-0.5px", lineHeight: 1 }}>TAX INVOICE</div>
            <div style={{ fontSize: "8px", color: "#bfdbfe", fontWeight: 700, letterSpacing: "3px", marginTop: "3px", textTransform: "uppercase" }}>GST Compliant · Original for Recipient</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "18px", fontWeight: 900, color: "#fff" }}>{inv.invoice_number || "INV-XXXX"}</div>
            <div style={{ fontSize: "9px", color: "#bfdbfe", marginTop: "3px" }}>Date of Issue: <strong>{fmtDate(inv.issued_date)}</strong></div>
            <div style={{ fontSize: "9px", color: "#bfdbfe", marginTop: "2px" }}>Due Date: <strong>{fmtDate(inv.due_date)}</strong></div>
            {inv.place_of_supply && <div style={{ fontSize: "9px", color: "#bfdbfe", marginTop: "2px" }}>Place of Supply: <strong>{inv.place_of_supply}</strong></div>}
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "2px solid #1d4ed8", flexShrink: 0 }}>
        <div style={{ padding: "10px 16px 10px 28px", borderRight: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: "7px", fontWeight: 900, color: "#9ca3af", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "4px" }}>Bill From (Supplier)</div>
          <div style={{ fontSize: "12px", fontWeight: 900, color: "#111827", lineHeight: 1.2 }}>{companyName}</div>
          <div style={{ marginTop: "4px", lineHeight: 1.5, color: "#374151", fontSize: "9px" }}>
            <div>{companyAddr}</div>
            <div>Ph: {companyPhone} | {companyEmail}</div>
            <div style={{ marginTop: "3px" }}><strong>GSTIN:</strong> {companyGstin} &nbsp;|&nbsp; <strong>PAN:</strong> {companyPan}</div>
          </div>
        </div>
        <div style={{ padding: "10px 28px 10px 16px" }}>
          <div style={{ fontSize: "7px", fontWeight: 900, color: "#9ca3af", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "4px" }}>Bill To (Recipient)</div>
          <div style={{ fontSize: "12px", fontWeight: 900, color: "#111827", lineHeight: 1.2 }}>{inv.client_name || "—"}</div>
          <div style={{ marginTop: "4px", lineHeight: 1.5, color: "#374151", fontSize: "9px" }}>
            {inv.billing_address && <div>{inv.billing_address}</div>}
            {inv.client_email && <div>{inv.client_email}</div>}
            {inv.client_gstin && <div><strong>GSTIN:</strong> {inv.client_gstin}</div>}
          </div>
          {inv.project_name && <div style={{ marginTop: "4px", fontSize: "9px", color: "#1d4ed8", fontWeight: 700 }}>Project: {inv.project_name}</div>}
        </div>
      </div>
      <div style={{ padding: "10px 28px 0", flexShrink: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9px" }}>
          <thead>
            <tr>
              <th className={hcell} style={{ width: "22px", textAlign: "center" }}>#</th>
              <th className={hcell} style={{ textAlign: "left" }}>Description of Goods / Service</th>
              <th className={hcell} style={{ width: "48px", textAlign: "center" }}>HSN/SAC</th>
              <th className={hcell} style={{ width: "32px", textAlign: "center" }}>Qty</th>
              <th className={hcell} style={{ width: "68px", textAlign: "right" }}>Rate (₹)</th>
              <th className={hcell} style={{ width: "44px", textAlign: "center" }}>GST%</th>
              <th className={hcell} style={{ width: "68px", textAlign: "right" }}>Taxable (₹)</th>
              {isIGST ? (
                <th className={hcell} style={{ width: "68px", textAlign: "right" }}>IGST (₹)</th>
              ) : (
                <>
                  <th className={hcell} style={{ width: "60px", textAlign: "right" }}>CGST (₹)</th>
                  <th className={hcell} style={{ width: "60px", textAlign: "right" }}>SGST (₹)</th>
                </>
              )}
              <th className={hcell} style={{ width: "76px", textAlign: "right", background: "#1e40af" }}>Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? items.map((item, i) => (
              <tr key={item.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                <td className={cell} style={{ textAlign: "center", color: "#9ca3af" }}>{i + 1}</td>
                <td className={cell}>
                  <div style={{ fontWeight: 600, color: "#111827" }}>{item.description || "—"}</div>
                  {item.hsn_sac && <div style={{ fontSize: "8px", color: "#9ca3af" }}>HSN/SAC: {item.hsn_sac}</div>}
                </td>
                <td className={cell} style={{ textAlign: "center", color: "#6b7280" }}>{item.hsn_sac || "—"}</td>
                <td className={cell} style={{ textAlign: "center" }}>{item.quantity}</td>
                <td className={cell} style={{ textAlign: "right" }}>{fmt(item.rate)}</td>
                <td className={cell} style={{ textAlign: "center" }}>{item.gst_rate}%</td>
                <td className={cell} style={{ textAlign: "right" }}>{fmt(item.amount)}</td>
                {isIGST ? (
                  <td className={cell} style={{ textAlign: "right" }}>{fmt(item.igst_amount)}</td>
                ) : (
                  <>
                    <td className={cell} style={{ textAlign: "right" }}>{fmt(round(item.cgst_amount))}</td>
                    <td className={cell} style={{ textAlign: "right" }}>{fmt(round(item.sgst_amount))}</td>
                  </>
                )}
                <td className={cell} style={{ textAlign: "right", fontWeight: 700, background: "#eff6ff" }}>{fmt(item.total)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={isIGST ? 9 : 10} className={cell} style={{ textAlign: "center", color: "#d1d5db", padding: "16px" }}>No line items</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 210px", padding: "8px 28px", flexShrink: 0 }}>
        <div style={{ paddingRight: "14px" }}>
          <div style={{ fontSize: "7px", fontWeight: 900, color: "#9ca3af", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "5px" }}>GST Tax Summary</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8px" }}>
            <thead>
              <tr style={{ background: "#f3f4f6" }}>
                <th style={{ border: "1px solid #e5e7eb", padding: "3px 7px", textAlign: "left" }}>GST Rate</th>
                <th style={{ border: "1px solid #e5e7eb", padding: "3px 7px", textAlign: "right" }}>Taxable</th>
                {isIGST
                  ? <th style={{ border: "1px solid #e5e7eb", padding: "3px 7px", textAlign: "right" }}>IGST</th>
                  : <><th style={{ border: "1px solid #e5e7eb", padding: "3px 7px", textAlign: "right" }}>CGST</th><th style={{ border: "1px solid #e5e7eb", padding: "3px 7px", textAlign: "right" }}>SGST</th></>}
                <th style={{ border: "1px solid #e5e7eb", padding: "3px 7px", textAlign: "right" }}>Total Tax</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(rateMap).map(([rate, row]) => (
                <tr key={rate}>
                  <td style={{ border: "1px solid #e5e7eb", padding: "2px 7px" }}>{rate}%</td>
                  <td style={{ border: "1px solid #e5e7eb", padding: "2px 7px", textAlign: "right" }}>{fmt(row.taxable)}</td>
                  {isIGST
                    ? <td style={{ border: "1px solid #e5e7eb", padding: "2px 7px", textAlign: "right" }}>{fmt(row.igst)}</td>
                    : <><td style={{ border: "1px solid #e5e7eb", padding: "2px 7px", textAlign: "right" }}>{fmt(row.cgst)}</td><td style={{ border: "1px solid #e5e7eb", padding: "2px 7px", textAlign: "right" }}>{fmt(row.sgst)}</td></>}
                  <td style={{ border: "1px solid #e5e7eb", padding: "2px 7px", textAlign: "right", fontWeight: 600 }}>{fmt(isIGST ? row.igst : row.cgst + row.sgst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ border: "1.5px solid #1d4ed8", borderRadius: "6px", overflow: "hidden", alignSelf: "start" }}>
          <div style={{ background: "#1d4ed8", padding: "5px 10px" }}>
            <div style={{ fontSize: "7px", fontWeight: 900, color: "#bfdbfe", letterSpacing: "2px", textTransform: "uppercase" }}>Amount Summary</div>
          </div>
          <div style={{ padding: "6px 10px", fontSize: "9px" }}>
            {[
              { label: "Subtotal", val: subtotal },
              ...(!isIGST && cgst > 0 ? [{ label: "CGST", val: cgst }] : []),
              ...(!isIGST && sgst > 0 ? [{ label: "SGST", val: sgst }] : []),
              ...(isIGST && igst > 0 ? [{ label: "IGST", val: igst }] : []),
            ].map(r => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", borderBottom: "1px solid #e5e7eb" }}>
                <span style={{ color: "#6b7280" }}>{r.label}</span>
                <span style={{ fontWeight: 600 }}>{fmt(r.val)}</span>
              </div>
            ))}
            {roundOff !== 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", borderBottom: "1px solid #fca5a5", color: "#ea580c" }}>
                <span style={{ fontSize: "8px" }}>Round Off</span>
                <span style={{ fontWeight: 600, fontSize: "8px" }}>{fmt(roundOff)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0 2px", marginTop: "2px" }}>
              <span style={{ fontWeight: 900, fontSize: "11px", color: "#111827" }}>Grand Total</span>
              <span style={{ fontWeight: 900, fontSize: "12px", color: "#1d4ed8" }}>{fmt(total)}</span>
            </div>
          </div>
        </div>
      </div>
      <div style={{ margin: "0 28px", padding: "6px 10px", background: "#eff6ff", borderRadius: "5px", border: "1px solid #bfdbfe", fontSize: "9px", flexShrink: 0 }}>
        <strong>Amount in Words:</strong> {amountInWords(total)}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "8px 28px", gap: "8px", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: inv.notes ? "1fr 1fr" : "1fr", gap: "10px" }}>
          {inv.bank_details && (
            <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "6px", padding: "8px 12px" }}>
              <div style={{ fontSize: "7px", fontWeight: 900, color: "#9ca3af", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "4px" }}>Bank / Payment Details</div>
              <div style={{ fontSize: "9px", color: "#374151", lineHeight: 1.6, whiteSpace: "pre-line" }}>{inv.bank_details}</div>
            </div>
          )}
          {inv.notes && (
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "6px", padding: "8px 12px" }}>
              <div style={{ fontSize: "7px", fontWeight: 900, color: "#1d4ed8", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "4px" }}>Notes / Remarks</div>
              <div style={{ fontSize: "9px", color: "#1e40af", lineHeight: 1.6, whiteSpace: "pre-line" }}>{inv.notes}</div>
            </div>
          )}
        </div>
        {inv.terms && (
          <div>
            <div style={{ fontSize: "7px", fontWeight: 900, color: "#9ca3af", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "3px" }}>Terms & Conditions</div>
            <div style={{ fontSize: "8px", color: "#6b7280", lineHeight: 1.5, whiteSpace: "pre-line" }}>{inv.terms}</div>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid #e5e7eb", paddingTop: "8px", gap: "20px" }}>
          <div>
            <div style={{ fontSize: "7px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "22px" }}>Authorised Signatory</div>
            <div style={{ borderTop: "1px solid #6b7280", paddingTop: "3px", fontSize: "8px", color: "#374151" }}>{companyName}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "7px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "22px" }}>Recipient Signature</div>
            <div style={{ borderTop: "1px solid #6b7280", paddingTop: "3px", fontSize: "8px", color: "#9ca3af" }}>Received in good condition</div>
          </div>
        </div>
      </div>
      <div style={{ background: "linear-gradient(135deg,#1e3a8a,#1d4ed8)", padding: "8px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ fontSize: "8px", color: "#bfdbfe" }}>This is a computer-generated invoice and does not require a physical signature.</div>
        <div style={{ fontSize: "8px", color: "#93c5fd", fontWeight: 700 }}>{companyName} · GSTIN: {companyGstin}</div>
      </div>
    </div>
  );
}

// ─── Settings Dialog ───────────────────────────────────────────────────────
function InvoiceSettingsDialog({ open, onOpenChange, initial, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; initial: InvoiceSettings; onSaved: (s: InvoiceSettings) => void;
}) {
  const [tab, setTab] = useState<"company" | "smtp" | "rules" | "permissions">("company");
  const [form, setForm] = useState<InvoiceSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState("");

  useEffect(() => { if (open) setForm(initial); }, [open, initial]);

  const set = (key: keyof InvoiceSettings, val: any) => setForm(f => ({ ...f, [key]: val }));

  const handleGstinChange = (val: string) => {
    const upperVal = val.toUpperCase();
    set("gstin", upperVal);
    const extractedPan = extractPANFromGSTIN(upperVal);
    if (extractedPan) set("pan", extractedPan);
  };
  const isGstinValid = !form.gstin || validateGSTIN(form.gstin);

  const toggleRole = (field: keyof InvoiceSettings, role: string) => {
    const arr = (form[field] as string[]) || [];
    set(field, arr.includes(role) ? arr.filter(r => r !== role) : [...arr, role]);
  };

  const handleSave = async () => {
    if (form.gstin && !validateGSTIN(form.gstin)) { toast.error("Invalid Company GSTIN format"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/invoices/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Failed to save settings"); }
      else { toast.success("Invoice settings saved"); onSaved(data.settings); onOpenChange(false); }
    } catch (e: any) { toast.error(e.message || "Failed to save"); } finally { setSaving(false); }
  };

  const handleTestSmtp = async () => {
    if (!form.smtp_host || !form.smtp_user || !form.smtp_pass) { toast.error("Fill SMTP host, user, password first"); return; }
    setTesting(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch("/api/invoices/settings/test-smtp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, test_to: testTo || form.smtp_user }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (!res.ok) toast.error(data.error || "SMTP test failed");
      else toast.success(data.message || "Test email sent");
    } catch (e: any) {
      if (e.name === "AbortError") toast.error("SMTP timeout — check host/port");
      else toast.error(e.message || "SMTP test failed");
    } finally { setTesting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl !grid-rows-[auto_1fr_auto] !grid p-0 overflow-hidden gap-0 max-h-[calc(100vh-4rem)] sm:max-h-[88vh]">
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
            <Settings size={16} />
          </div>
          <div className="flex-1 text-left">
            <DialogTitle className="text-sm font-semibold">Invoice Settings</DialogTitle>
            <DialogDescription className="text-xs">Company profile, SMTP, rules &amp; access control</DialogDescription>
          </div>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="mx-6 mt-4 grid grid-cols-4">
              <TabsTrigger value="company" className="text-xs gap-1.5"><Building2 size={12} /> Company</TabsTrigger>
              <TabsTrigger value="smtp" className="text-xs gap-1.5"><Mail size={12} /> SMTP</TabsTrigger>
              <TabsTrigger value="rules" className="text-xs gap-1.5"><Zap size={12} /> Rules</TabsTrigger>
              <TabsTrigger value="permissions" className="text-xs gap-1.5"><Shield size={12} /> Permissions</TabsTrigger>
            </TabsList>

            <div className="px-6 py-5">
              {tab === "company" && (
                <div className="space-y-5">
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Building2 size={11} /> Company &amp; GST Identity
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-xs">Company Name</Label>
                      <Input value={form.company_name} onChange={e => set("company_name", e.target.value)} placeholder="NexaWork" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">GSTIN</Label>
                      <div className="relative">
                        <Input value={form.gstin} onChange={e => handleGstinChange(e.target.value)} placeholder="29ABCDE1234F1Z5"
                          className={cn(!isGstinValid && "border-rose-500 focus-visible:ring-rose-500/30")} />
                        {!isGstinValid && (
                          <div className="absolute top-1/2 right-3 -translate-y-1/2 flex items-center gap-1 text-rose-500">
                            <AlertTriangle size={12} />
                          </div>
                        )}
                        {form.gstin && isGstinValid && (
                          <div className="absolute top-1/2 right-3 -translate-y-1/2 text-emerald-500">
                            <CheckCircle2 size={12} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5"><Label className="text-xs">PAN</Label><Input value={form.pan} onChange={e => set("pan", e.target.value)} placeholder="ABCDE1234F" /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+91 98765 43210" /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Email</Label><Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="accounts@company.com" /></div>
                  </div>

                  <div className="space-y-1.5"><Label className="text-xs">Registered Address</Label><Input value={form.address} onChange={e => set("address", e.target.value)} placeholder="123 Tech Park, Whitefield" /></div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5"><Label className="text-xs">City</Label><Input value={form.city} onChange={e => set("city", e.target.value)} placeholder="Bangalore" /></div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">State</Label>
                      <Select value={form.state || undefined} onValueChange={v => set("state", v)}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Select State" /></SelectTrigger>
                        <SelectContent>
                          {INDIAN_STATES_WITH_CODES.map(st => (
                            <SelectItem key={st.code} value={st.name}>{st.name} ({st.code})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5"><Label className="text-xs">Pincode</Label><Input value={form.pincode} onChange={e => set("pincode", e.target.value)} placeholder="560066" /></div>
                  </div>

                  <Separator />
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <IndianRupee size={11} /> Bank Details (shown on invoices)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label className="text-xs">Bank Name</Label><Input value={form.bank_name} onChange={e => set("bank_name", e.target.value)} placeholder="HDFC Bank" /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Account Number</Label><Input value={form.bank_account} onChange={e => set("bank_account", e.target.value)} placeholder="50100XXXXXXXXX" /></div>
                    <div className="space-y-1.5"><Label className="text-xs">IFSC Code</Label><Input value={form.bank_ifsc} onChange={e => set("bank_ifsc", e.target.value)} placeholder="HDFC0001234" /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Branch</Label><Input value={form.bank_branch} onChange={e => set("bank_branch", e.target.value)} placeholder="Whitefield, Bangalore" /></div>
                  </div>

                  <Separator />
                  <div className="space-y-1.5">
                    <Label className="text-xs">Default Terms &amp; Conditions</Label>
                    <Textarea rows={4} value={form.default_terms} onChange={e => set("default_terms", e.target.value)} className="resize-none" />
                  </div>
                </div>
              )}

              {tab === "smtp" && (
                <div className="space-y-5">
                  <div className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                    <Lock size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-700">SMTP credentials are stored securely and used only for sending invoice emails. Super Admin only.</p>
                  </div>

                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Mail size={11} /> SMTP Server Configuration</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-1.5"><Label className="text-xs">SMTP Host</Label><Input value={form.smtp_host} onChange={e => set("smtp_host", e.target.value)} placeholder="smtp.gmail.com" /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Port</Label><Input type="number" value={form.smtp_port} onChange={e => set("smtp_port", Number(e.target.value))} placeholder="587" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label className="text-xs">SMTP Username</Label><Input value={form.smtp_user} onChange={e => set("smtp_user", e.target.value)} placeholder="invoices@yourcompany.com" /></div>
                    <div className="space-y-1.5"><Label className="text-xs">SMTP Password</Label><Input type="password" value={form.smtp_pass} onChange={e => set("smtp_pass", e.target.value)} placeholder="••••••••••••" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label className="text-xs">From Name</Label><Input value={form.smtp_from_name} onChange={e => set("smtp_from_name", e.target.value)} placeholder="NexaWork" /></div>
                    <div className="space-y-1.5"><Label className="text-xs">From Email</Label><Input type="email" value={form.smtp_from_email} onChange={e => set("smtp_from_email", e.target.value)} placeholder="invoices@your-company.com" /></div>
                  </div>

                  <Card>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">Use SSL/TLS</p>
                        <p className="text-xs text-muted-foreground">Enable for port 465</p>
                      </div>
                      <Switch checked={form.smtp_secure} onCheckedChange={v => set("smtp_secure", v)} />
                    </CardContent>
                  </Card>

                  <Separator />
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><FlaskConical size={11} /> Test Connection</p>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs">Send test email to</Label>
                      <Input type="email" value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="your@email.com or leave blank to use SMTP user" />
                    </div>
                    <Button type="button" onClick={handleTestSmtp} disabled={testing}>
                      {testing ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />}
                      Send Test
                    </Button>
                  </div>
                </div>
              )}

              {tab === "rules" && (
                <div className="space-y-5">
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Zap size={11} /> Numbering &amp; Format</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5"><Label className="text-xs">Invoice Prefix</Label><Input value={form.invoice_prefix} onChange={e => set("invoice_prefix", e.target.value)} placeholder="INV" /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Default Due Days</Label><Input type="number" value={form.default_due_days} onChange={e => set("default_due_days", Number(e.target.value))} /></div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Default GST Rate (%)</Label>
                      <Select value={String(form.default_gst_rate)} onValueChange={v => set("default_gst_rate", Number(v))}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{GST_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Default Place of Supply</Label>
                    <Input value={form.default_place_of_supply} onChange={e => set("default_place_of_supply", e.target.value)} placeholder="Karnataka" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Invoice Footer Text</Label>
                    <Textarea rows={2} value={form.invoice_footer} onChange={e => set("invoice_footer", e.target.value)} className="resize-none" />
                  </div>

                  <Separator />
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Settings size={11} /> Behaviour Toggles</p>
                  {[
                    { key: "auto_numbering" as const,   label: "Auto-generate invoice numbers", desc: "Format: INV-2026-001" },
                    { key: "show_logo" as const,         label: "Show company logo on PDF",      desc: "Adds your logo at the top of the invoice" },
                    { key: "require_approval" as const, label: "Require approval before sending", desc: "Drafts need admin approval before being sent" },
                    { key: "send_on_create" as const,    label: "Auto-send on creation",         desc: "Email the client automatically when an invoice is created" },
                  ].map(t => (
                    <Card key={t.key}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{t.label}</p>
                          <p className="text-xs text-muted-foreground">{t.desc}</p>
                        </div>
                        <Switch checked={form[t.key] as boolean} onCheckedChange={v => set(t.key, v)} />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {tab === "permissions" && (
                <div className="space-y-5">
                  <div className="flex items-start gap-3 rounded-md border border-sky-500/30 bg-sky-500/10 p-3">
                    <Shield size={14} className="text-sky-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-sky-700">Control which roles can perform each invoice action. Super Admin always has full access.</p>
                  </div>

                  {[
                    { field: "can_create_roles",    icon: Plus,         label: "Create Invoice",   desc: "Roles allowed to create new invoices" },
                    { field: "can_edit_roles",      icon: FileText,     label: "Edit Invoice",     desc: "Roles allowed to edit draft invoices" },
                    { field: "can_send_roles",      icon: Send,         label: "Send Invoice",     desc: "Roles allowed to send invoices to clients" },
                    { field: "can_mark_paid_roles", icon: CheckCircle2, label: "Mark as Paid",     desc: "Roles allowed to mark invoices as paid" },
                    { field: "can_delete_roles",    icon: Trash2,       label: "Delete Invoice",   desc: "Roles allowed to permanently delete invoices" },
                  ].map(({ field, icon: Icon, label, desc }) => (
                    <Card key={field}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Icon size={13} className="text-muted-foreground" />
                          <span className="text-sm font-semibold text-foreground">{label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {ALL_ROLES.map(r => {
                            const active = (form[field as keyof InvoiceSettings] as string[])?.includes(r.value);
                            return (
                              <Button
                                key={r.value} type="button" variant="outline" size="sm"
                                className={cn("h-7 text-xs", active && r.color)}
                                onClick={() => toggleRole(field as keyof InvoiceSettings, r.value)}
                              >
                                {r.label} {active ? <CheckCircle2 size={10} /> : <Plus size={10} />}
                              </Button>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </Tabs>
        </div>

        <DialogFooter className="!mx-0 !mb-0 !rounded-none flex-row items-center sm:justify-between gap-2 border-t border-border bg-background px-6 py-4">
          <p className="text-xs text-muted-foreground hidden sm:block">Changes apply immediately to all new invoices</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" size="sm" disabled={saving} onClick={handleSave}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save Settings
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invoice Modal (create / preview) ──────────────────────────────────────
function InvoiceModal({ open, onClose, onSaved, clients, projects, teams, settings }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  clients: Client[]; projects: Project[]; teams: Team[]; settings: InvoiceSettings;
}) {
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"form" | "preview">("form");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [log, setLog] = useState({ emp_id: "", name: "", dept: "", team: "", desig: "" });
  const [statusModal, setStatusModal] = useState<{ created: boolean; sent: boolean; invoice_number: string; email?: string } | null>(null);
  const [tempInvoiceForPDF, setTempInvoiceForPDF] = useState<Invoice | null>(null);
  const [empPickerOpen, setEmpPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/employees").then(r => r.json()).then(data => setEmployees(data.employees || [])).catch(() => {});
  }, [open]);

  const handleEmpSelect = (empId: string) => {
    const emp = employees.find(e => e.employee_id === empId);
    if (emp) {
      setLog({ emp_id: emp.employee_id, name: emp.name, dept: emp.department || "", team: (emp.teams as any)?.name || "", desig: emp.designation || "" });
    } else setLog({ emp_id: "", name: "", dept: "", team: "", desig: "" });
    setEmpPickerOpen(false);
  };

  const [form, setForm] = useState({
    client_id: "", project_id: "", team_id: "",
    issued_date: new Date().toISOString().split("T")[0],
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
    client_gstin: "", billing_address: "", client_email: "",
    place_of_supply: "", notes: "", terms: "Payment due within 30 days.\nLate payment may attract 1.5% monthly interest.",
    bank_details: "Bank: HDFC Bank\nAccount No: XXXXXXXX\nIFSC: HDFC0000XXX\nBranch: Bangalore",
    status: "draft" as const,
  });
  const [items, setItems] = useState<LineItem[]>([
    { id: "1", description: "", hsn_sac: "", quantity: 1, rate: 0, gst_rate: 18, amount: 0, cgst_amount: 0, sgst_amount: 0, igst_amount: 0, total: 0 },
  ]);

  const calcItem = (item: Partial<LineItem>): LineItem => {
    const qty = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    const gstR = Number(item.gst_rate) || 0;
    const total = qty * rate;
    const gstMultiplier = 1 + (gstR / 100);
    const amount = total / gstMultiplier;
    const cgst = amount * (gstR / 2) / 100;
    const sgst = amount * (gstR / 2) / 100;
    return { ...item, rate: round(rate), amount, cgst_amount: cgst, sgst_amount: sgst, igst_amount: 0, total } as LineItem;
  };

  const updateItem = (id: string, field: keyof LineItem, val: any) => {
    setItems(prev => prev.map(it => it.id === id ? calcItem({ ...it, [field]: val }) : it));
  };
  const addItem = () => {
    setItems(prev => [...prev, { id: String(Date.now()), description: "", hsn_sac: "", quantity: 1, rate: 0, gst_rate: 18, amount: 0, cgst_amount: 0, sgst_amount: 0, igst_amount: 0, total: 0 }]);
  };
  const removeItem = (id: string) => { if (items.length > 1) setItems(prev => prev.filter(it => it.id !== id)); };

  const subtotalExact = items.reduce((s, i) => s + i.amount, 0);
  const totalCgstExact = items.reduce((s, i) => s + i.cgst_amount, 0);
  const totalSgstExact = items.reduce((s, i) => s + i.sgst_amount, 0);
  const totalIgstExact = items.reduce((s, i) => s + i.igst_amount, 0);
  const subtotal = round(subtotalExact);
  const totalCgst = round(totalCgstExact);
  const totalSgst = round(totalSgstExact);
  const totalIgst = round(totalIgstExact);
  const totalBeforeRounding = subtotalExact + totalCgstExact + totalSgstExact + totalIgstExact;
  const total = round(totalBeforeRounding);
  const roundOff = total - totalBeforeRounding;

  const selectedClient = clients.find(c => c.id === form.client_id);
  const selectedProject = projects.find(p => p.id === form.project_id);

  useEffect(() => {
    if (selectedClient) {
      setForm(f => ({ ...f, client_email: selectedClient.email || "", billing_address: selectedClient.address || selectedClient.company || "", client_gstin: selectedClient.gstin || "" }));
    }
  }, [form.client_id, selectedClient]);

  useEffect(() => {
    if (selectedProject) {
      const pClientId = selectedProject.client_id;
      if (pClientId && !form.client_id) setForm(f => ({ ...f, client_id: pClientId }));
      const pTeamIds = selectedProject.teamIds;
      if (pTeamIds && pTeamIds.length > 0) setForm(f => ({ ...f, team_id: pTeamIds[0] }));
      if (selectedProject.issued_date) setForm(f => ({ ...f, issued_date: selectedProject.issued_date! }));
      if (selectedProject.due_date) setForm(f => ({ ...f, due_date: selectedProject.due_date! }));
    }
  }, [form.project_id, selectedProject]);

  const handleSave = async (status: "draft" | "sent" = "draft") => {
    if (!form.client_id) { toast.error("Please select a client"); return; }
    if (form.client_gstin && !validateGSTIN(form.client_gstin)) { toast.error("Invalid Client GSTIN format"); return; }
    if (items.every(i => !i.description)) { toast.error("Add at least one line item"); return; }
    setSaving(true);
    try {
      const createRes = await fetch("/api/invoices", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form, status: "draft",
          subtotal, cgst: totalCgst, sgst: totalSgst, igst: totalIgst,
          tax: totalCgst + totalSgst + totalIgst, total, amount: total,
          items,
          created_by_emp_id: log.emp_id || null,
          created_by_name: log.name || null,
          created_by_dept: log.dept || null,
          created_by_team: log.team || null,
          created_by_desig: log.desig || null,
        }),
      });
      if (!createRes.ok) {
        const error = await createRes.json().catch(() => ({ error: `HTTP ${createRes.status}` }));
        throw new Error(error?.error || `API Error: ${createRes.status}`);
      }
      const responseData = await createRes.json();
      const createdInvoice = responseData.invoice;
      const client = clients.find(c => c.id === form.client_id);
      const clientEmail = client?.email;
      const project = projects.find(p => p.id === form.project_id);
      setTempInvoiceForPDF(createdInvoice);
      setStatusModal({ created: true, sent: false, invoice_number: createdInvoice.invoice_number, email: clientEmail });

      if (status === "sent" && clientEmail) {
        (async () => {
          try {
            setActiveTab("preview");
            await new Promise(resolve => setTimeout(resolve, 1200));
            const el = document.getElementById("a4-invoice-render");
            const baseInvBody = {
              invoiceNumber: createdInvoice.invoice_number, clientName: client?.name, projectName: project?.name,
              issuedDate: createdInvoice.issued_date, dueDate: createdInvoice.due_date,
              bankDetails: createdInvoice.bank_details,
              subtotal: createdInvoice.subtotal, cgst: createdInvoice.cgst, sgst: createdInvoice.sgst, igst: createdInvoice.igst, total: createdInvoice.total,
            };

            if (!el) {
              const shareRes = await fetch("/api/invoices/share", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  to: clientEmail, invoice: baseInvBody,
                  subject: `Invoice ${createdInvoice.invoice_number} from ${settings.company_name}`,
                  message: `Dear ${client?.name || "Valued Client"},\n\nPlease find your invoice attached.`,
                  pdfBase64: null, pdfFileName: null,
                }),
              });
              if (shareRes.ok) {
                await fetch(`/api/invoices/update-status`, {
                  method: "PATCH", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: createdInvoice.id, status: "sent" }),
                }).catch(() => {});
                setStatusModal(prev => prev ? { ...prev, sent: true } : null);
                toast.info("Email sent without PDF (render failed)");
              } else {
                toast.error("Failed to send email");
                await fetch(`/api/invoices/update-status`, {
                  method: "PATCH", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: createdInvoice.id, status: "error" }),
                }).catch(() => {});
              }
              return;
            }

            const htmlContent = el.innerHTML;
            const pdfRes = await fetch("/api/invoices/generate-pdf", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ htmlContent, invoiceNumber: createdInvoice.invoice_number }),
            });
            if (!pdfRes.ok) throw new Error("PDF generation failed: " + (await pdfRes.json()).error);
            const pdfData = await pdfRes.json();

            const shareRes = await fetch("/api/invoices/share", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: clientEmail, invoice: baseInvBody,
                subject: `Invoice ${createdInvoice.invoice_number} from ${settings.company_name}`,
                message: `Dear ${client?.name || "Valued Client"},\n\nPlease find your invoice attached.`,
                pdfBase64: pdfData.pdfBase64, pdfFileName: `${createdInvoice.invoice_number}.pdf`,
              }),
            });

            if (shareRes.ok) {
              await fetch(`/api/invoices/update-status`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: createdInvoice.id, status: "sent" }),
              }).catch(() => {});
              setStatusModal(prev => prev ? { ...prev, sent: true } : null);
            } else {
              await fetch(`/api/invoices/update-status`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: createdInvoice.id, status: "error" }),
              }).catch(() => {});
            }
          } catch (sendErr: any) {
            toast.error(`Email send error: ${sendErr?.message}`);
          }
        })();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message);
    } finally { setSaving(false); }
  };

  return (
    <>
      <Dialog open={open && !statusModal} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="sm:max-w-6xl !grid-rows-[auto_1fr_auto] !grid p-0 overflow-hidden gap-0 max-h-[calc(100vh-3rem)] sm:max-h-[92vh]">
          <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
                <FileText size={16} />
              </div>
              <div className="text-left">
                <DialogTitle className="text-sm font-semibold">Create GST Invoice</DialogTitle>
                <DialogDescription className="text-xs">Tax-compliant invoice with real-time preview</DialogDescription>
              </div>
            </div>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <TabsList>
                <TabsTrigger value="form" className="text-xs">Form</TabsTrigger>
                <TabsTrigger value="preview" className="text-xs">Preview</TabsTrigger>
              </TabsList>
            </Tabs>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto">
            {activeTab === "form" && (
              <div className="p-6 space-y-6">
                {/* Created By gate */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Shield size={11} /> Created By
                    <span className="font-normal">(Internal log · unlocks invoice fields)</span>
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Employee ID</Label>
                      <Popover open={empPickerOpen} onOpenChange={setEmpPickerOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                            <span className={log.emp_id ? "text-foreground" : "text-muted-foreground"}>
                              {log.emp_id ? `${log.emp_id} · ${log.name}` : "Select Employee ID"}
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
                                  <CommandItem key={e.id} value={`${e.name} ${e.employee_id}`} onSelect={() => handleEmpSelect(e.employee_id)}>
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
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Employee Name</Label>
                      <div className="h-9 flex items-center rounded-md border border-border bg-muted/40 px-3 text-sm">
                        {log.name || <span className="text-muted-foreground">Auto-filled on selection</span>}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Department</Label>
                      <div className="h-9 flex items-center rounded-md border border-border bg-muted/40 px-3 text-sm">
                        {log.dept || <span className="text-muted-foreground">—</span>}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Team</Label>
                      <div className="h-9 flex items-center rounded-md border border-border bg-muted/40 px-3 text-sm">
                        {log.team || <span className="text-muted-foreground">—</span>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={cn("space-y-6 transition-opacity", !log.emp_id && "opacity-40 pointer-events-none select-none")}>
                  <Separator />

                  {/* Parties */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                      <Building2 size={11} /> Invoice Parties
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Client *</Label>
                        <Select value={form.client_id || undefined} onValueChange={v => setForm(f => ({ ...f, client_id: v }))}>
                          <SelectTrigger className="w-full"><SelectValue placeholder="Select client" /></SelectTrigger>
                          <SelectContent>
                            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Project</Label>
                        <Select value={form.project_id || undefined} onValueChange={v => setForm(f => ({ ...f, project_id: v }))}>
                          <SelectTrigger className="w-full"><SelectValue placeholder="Select project" /></SelectTrigger>
                          <SelectContent>
                            {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Team</Label>
                        <Select value={form.team_id || undefined} onValueChange={v => setForm(f => ({ ...f, team_id: v }))}>
                          <SelectTrigger className="w-full"><SelectValue placeholder="Select team" /></SelectTrigger>
                          <SelectContent>
                            {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Client GSTIN</Label>
                        <div className="relative">
                          <Input
                            value={form.client_gstin}
                            onChange={e => setForm(f => ({ ...f, client_gstin: e.target.value.toUpperCase() }))}
                            placeholder="29ABCDE1234F1Z5"
                            className={cn(form.client_gstin && !validateGSTIN(form.client_gstin) && "border-rose-500")}
                          />
                          {form.client_gstin && !validateGSTIN(form.client_gstin) && <AlertTriangle size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-rose-500" />}
                          {form.client_gstin && validateGSTIN(form.client_gstin) && <CheckCircle2 size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Client Email</Label>
                        <Input type="email" value={form.client_email} onChange={e => setForm(f => ({ ...f, client_email: e.target.value }))} placeholder="accounts@client.com" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Place of Supply</Label>
                        <Select value={form.place_of_supply || undefined} onValueChange={v => setForm(f => ({ ...f, place_of_supply: v }))}>
                          <SelectTrigger className="w-full"><SelectValue placeholder="Select State" /></SelectTrigger>
                          <SelectContent>
                            {INDIAN_STATES_WITH_CODES.map(st => (
                              <SelectItem key={st.code} value={st.name}>{st.name} ({st.code})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <Label className="text-xs">Billing Address</Label>
                      <Input value={form.billing_address} onChange={e => setForm(f => ({ ...f, billing_address: e.target.value }))} placeholder="123 Business Park, City, State — 560001" />
                    </div>
                  </div>

                  {/* Dates */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                      <Clock size={11} /> Invoice Dates
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Issue Date *</Label>
                        <Input type="date" value={form.issued_date} onChange={e => setForm(f => ({ ...f, issued_date: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Due Date *</Label>
                        <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
                      </div>
                    </div>
                  </div>

                  {/* Line Items */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                        <FileText size={11} /> Line Items
                      </p>
                      <Button type="button" variant="outline" size="sm" onClick={addItem}>
                        <Plus size={11} /> Add Item
                      </Button>
                    </div>
                    <Card className="p-0 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead className="w-28">HSN/SAC</TableHead>
                            <TableHead className="w-20 text-center">Qty</TableHead>
                            <TableHead className="w-24 text-center">GST %</TableHead>
                            <TableHead className="w-32 text-right">Rate (₹)</TableHead>
                            <TableHead className="w-36 text-right">Total (inc. GST)</TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((item) => (
                            <TableRow key={item.id} className="group">
                              <TableCell className="p-2">
                                <Input value={item.description} onChange={e => updateItem(item.id, "description", e.target.value)}
                                  placeholder="Service / Product description" className="h-8 border-0 shadow-none focus-visible:ring-0 px-2" />
                              </TableCell>
                              <TableCell className="p-2">
                                <Input value={item.hsn_sac} onChange={e => updateItem(item.id, "hsn_sac", e.target.value)}
                                  placeholder="998314" className="h-8 border-0 shadow-none focus-visible:ring-0 px-2" />
                              </TableCell>
                              <TableCell className="p-2">
                                <Input type="number" value={item.quantity} min={1}
                                  onChange={e => updateItem(item.id, "quantity", Number(e.target.value))}
                                  className="h-8 border-0 shadow-none focus-visible:ring-0 px-2 text-center" />
                              </TableCell>
                              <TableCell className="p-2">
                                <Select value={String(item.gst_rate)} onValueChange={(v) => updateItem(item.id, "gst_rate", Number(v))}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>{GST_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="p-2">
                                <Input type="number" value={item.rate} min={0}
                                  onChange={e => updateItem(item.id, "rate", Number(e.target.value))}
                                  placeholder="Rate (inc. GST)"
                                  className="h-8 border-0 shadow-none focus-visible:ring-0 px-2 text-right font-medium text-primary tabular-nums" />
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">{fmt(item.total)}</TableCell>
                              <TableCell className="p-2 text-right">
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-rose-500 hover:bg-rose-500/10" onClick={() => removeItem(item.id)}>
                                  <Trash2 size={12} />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Card>

                    <div className="flex justify-end mt-3">
                      <Card className="w-64">
                        <CardContent className="p-3 space-y-1.5 text-xs">
                          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-medium tabular-nums">{fmt(subtotal)}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">CGST</span><span className="tabular-nums">{fmt(totalCgst)}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">SGST</span><span className="tabular-nums">{fmt(totalSgst)}</span></div>
                          {roundOff !== 0 && (
                            <div className="flex justify-between text-orange-600"><span>Round Off</span><span className="font-medium tabular-nums">{fmt(roundOff)}</span></div>
                          )}
                          <Separator />
                          <div className="flex justify-between">
                            <span className="font-semibold text-foreground text-sm">Total</span>
                            <span className="font-semibold text-primary text-sm tabular-nums">{fmt(total)}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  {/* Notes & Terms */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Bank Details</Label>
                      <Textarea rows={4} value={form.bank_details} onChange={e => setForm(f => ({ ...f, bank_details: e.target.value }))} className="resize-none" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Terms &amp; Conditions</Label>
                      <Textarea rows={4} value={form.terms} onChange={e => setForm(f => ({ ...f, terms: e.target.value }))} className="resize-none" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Notes (optional)</Label>
                    <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional notes for the client…" className="resize-none" />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "preview" && (
              <div className="flex justify-center bg-muted/30 py-6 px-4">
                <SettingsCtx.Provider value={settings}>
                  <div style={{ boxShadow: "0 8px 48px rgba(0,0,0,0.4)" }}>
                    <A4Invoice
                      id="a4-invoice-render"
                      inv={tempInvoiceForPDF
                        ? { ...tempInvoiceForPDF, client_name: selectedClient?.name, project_name: selectedProject?.name }
                        : { ...form, invoice_number: "INV-PREVIEW", client_name: selectedClient?.name, project_name: selectedProject?.name }}
                      items={tempInvoiceForPDF ? (tempInvoiceForPDF.invoice_items || []) : items}
                    />
                  </div>
                </SettingsCtx.Provider>
              </div>
            )}
          </div>

          <DialogFooter className="!mx-0 !mb-0 !rounded-none flex-row items-center sm:justify-between gap-2 border-t border-border bg-background px-6 py-4">
            <span className="text-xs text-muted-foreground">
              {items.filter(i => i.description).length} item{items.filter(i => i.description).length !== 1 ? "s" : ""} · Total <span className="font-semibold text-foreground tabular-nums">{fmt(total)}</span>
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => handleSave("draft")}>
                {saving && <Loader2 size={12} className="animate-spin" />}
                <FileText size={12} /> Save as Draft
              </Button>
              <Button type="button" size="sm" disabled={saving} onClick={() => handleSave("sent")}>
                {saving && <Loader2 size={12} className="animate-spin" />}
                <Send size={12} /> Create &amp; Send
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {statusModal && (
        <StatusModal
          created={statusModal.created} sent={statusModal.sent}
          invoiceNumber={statusModal.invoice_number} email={statusModal.email}
          onClose={() => {
            setStatusModal(null);
            if (statusModal.created) { onSaved(); onClose(); }
          }}
        />
      )}
    </>
  );
}

// ─── Status Modal ──────────────────────────────────────────────────────────
function StatusModal({ created, sent, invoiceNumber, email, onClose }: {
  created: boolean; sent: boolean; invoiceNumber: string; email?: string; onClose: () => void;
}) {
  const [isSending, setIsSending] = useState(!!email && !sent);

  useEffect(() => {
    if (sent || !email) {
      const timer = setTimeout(onClose, 3500);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose, sent, email]);

  useEffect(() => { if (sent && isSending) setIsSending(false); }, [sent, isSending]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Invoice Status</DialogTitle>
        </DialogHeader>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Invoice Number</p>
            <p className="text-sm font-semibold text-foreground tabular-nums">{invoiceNumber}</p>
          </CardContent>
        </Card>

        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/10 flex-shrink-0">
            <CheckCircle2 size={15} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Invoice Created</p>
            <p className="text-xs text-muted-foreground">Saved to database successfully</p>
          </div>
        </div>

        {email ? (
          <div className="flex items-start gap-3">
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-md flex-shrink-0",
              sent ? "bg-emerald-500/10" : isSending ? "bg-sky-500/10" : "bg-amber-500/10")}>
              {sent ? <CheckCircle2 size={15} className="text-emerald-600" />
                : isSending ? <Mail size={15} className="text-sky-600 animate-pulse" />
                : <AlertCircle size={15} className="text-amber-600" />}
            </div>
            <div>
              <p className={cn("text-sm font-semibold",
                sent ? "text-emerald-600" : isSending ? "text-sky-600" : "text-amber-600")}>
                {sent ? "Email sent" : isSending ? "Sending email…" : "Email send failed"}
              </p>
              <p className="text-xs text-muted-foreground">
                {sent ? `PDF delivered to ${email}` : isSending ? `Generating PDF and sending to ${email}` : `Could not send to ${email}.`}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted flex-shrink-0">
              <Mail size={15} className="text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">No email on file</p>
              <p className="text-xs text-muted-foreground">Client email not configured</p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" size="sm" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Preview Modal ─────────────────────────────────────────────────────────
function PreviewModal({ invoice, onClose, settings }: {
  invoice: Invoice; onClose: () => void; settings: InvoiceSettings;
}) {
  const [shareEmail, setShareEmail] = useState(invoice.client_email || "");
  const [shareMsg] = useState("Please find the attached invoice for your reference.");
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const invData = { ...invoice, client_name: invoice.clients?.name, project_name: invoice.projects?.name };

  const buildA4PDF = async (): Promise<{ pdfBase64: string; fileSize: number }> => {
    const el = document.getElementById("a4-invoice-render");
    if (!el) throw new Error("Invoice render element not found");
    const htmlContent = el.innerHTML;
    const pdfRes = await fetch("/api/invoices/generate-pdf", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ htmlContent, invoiceNumber: invoice.invoice_number }),
    });
    if (!pdfRes.ok) {
      const errData = await pdfRes.json().catch(() => ({}));
      throw new Error("PDF generation failed: " + (errData.error || pdfRes.statusText));
    }
    const pdfData = await pdfRes.json();
    return { pdfBase64: pdfData.pdfBase64, fileSize: pdfData.fileSize };
  };

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const { pdfBase64 } = await buildA4PDF();
      const binaryString = atob(pdfBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${invoice.invoice_number}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("PDF downloaded");
    } catch (e: any) {
      toast.error("PDF generation failed: " + e.message);
    } finally { setDownloading(false); }
  };

  const handleShare = async () => {
    if (!shareEmail) { toast.error("Enter recipient email"); return; }
    setSharing(true);
    try {
      const { pdfBase64 } = await buildA4PDF();
      const res = await fetch("/api/invoices/share", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: shareEmail,
          subject: `Invoice ${invoice.invoice_number}`,
          message: shareMsg, pdfBase64, pdfFileName: `${invoice.invoice_number}.pdf`,
          invoice: {
            invoiceNumber: invoice.invoice_number, issuedDate: invoice.issued_date, dueDate: invoice.due_date,
            clientName: invoice.clients?.name, clientGstin: invoice.client_gstin,
            billingAddress: invoice.billing_address, projectName: invoice.projects?.name,
            bankDetails: invoice.bank_details, notes: invoice.notes,
            subtotal: invoice.subtotal, cgst: invoice.cgst, sgst: invoice.sgst, igst: invoice.igst, total: invoice.total,
            items: invoice.invoice_items || [],
          },
        }),
      });
      const resData = await res.json();
      if (res.ok) toast.success(`Invoice emailed to ${shareEmail}`);
      else toast.error(resData.error || "Failed to send email");
    } catch (err: any) {
      toast.error(err?.message || "Failed to send email");
    } finally { setSharing(false); }
  };

  return (
    <SettingsCtx.Provider value={settings}>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-4xl !grid-rows-[auto_auto_1fr] !grid p-0 overflow-hidden gap-0 max-h-[calc(100vh-2rem)] sm:max-h-[96vh]">
          <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b border-border px-5 py-3 bg-muted/30">
            <div className="flex items-center gap-3">
              <FileText size={16} className="text-primary" />
              <div className="text-left">
                <DialogTitle className="text-sm font-semibold">{invoice.invoice_number}</DialogTitle>
                <DialogDescription className="text-xs">{invoice.clients?.name || "—"} · {fmt(invoice.total)}</DialogDescription>
              </div>
              {statusBadge(invoice.status)}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1">
                <Mail size={12} className="text-primary" />
                <input
                  value={shareEmail} onChange={e => setShareEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !sharing) handleShare(); }}
                  placeholder="recipient@example.com" type="email"
                  className="h-7 w-44 bg-transparent text-xs outline-none"
                />
                <Button type="button" size="sm" className="h-7 text-xs" onClick={handleShare} disabled={sharing || !shareEmail}>
                  {sharing ? <Loader2 size={11} className="animate-spin" /> : <Send size={10} />}
                  Send PDF
                </Button>
              </div>
              <Button type="button" size="sm" onClick={handleDownloadPDF} disabled={downloading}>
                {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                Download PDF
              </Button>
            </div>
          </DialogHeader>

          {(invoice.created_by_emp_id || invoice.created_by_name) && (
            <div className="flex-shrink-0 border-b border-border bg-muted/20 px-5 py-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <Shield size={11} className="text-primary" />
                <span className="text-xs font-semibold text-muted-foreground">Internal Invoice Log — not visible in PDF or email</span>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                {invoice.created_by_emp_id && <span><span className="text-muted-foreground">Emp ID</span> <span className="font-medium text-foreground">{invoice.created_by_emp_id}</span></span>}
                {invoice.created_by_name && <span><span className="text-muted-foreground">Name</span> <span className="font-medium text-foreground">{invoice.created_by_name}</span></span>}
                {invoice.created_by_desig && <span><span className="text-muted-foreground">Designation</span> <span className="text-foreground">{invoice.created_by_desig}</span></span>}
                {invoice.created_by_dept && <span><span className="text-muted-foreground">Dept</span> <span className="text-foreground">{invoice.created_by_dept}</span></span>}
                {invoice.created_by_team && <span><span className="text-muted-foreground">Team</span> <span className="text-foreground">{invoice.created_by_team}</span></span>}
              </div>
            </div>
          )}

          <div className="overflow-y-auto bg-muted/30 flex justify-center py-6 px-4">
            <div style={{ boxShadow: "0 8px 48px rgba(0,0,0,0.4)", borderRadius: "2px" }}>
              <A4Invoice id="a4-invoice-render" inv={invData} items={invoice.invoice_items || []} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SettingsCtx.Provider>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function InvoicingPage() {
  const { canCreate, canDelete, canExport } = usePermission("invoicing");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [previewInv, setPreviewInv] = useState<Invoice | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<InvoiceSettings>(EMPTY_SETTINGS);
  const [deleteConfirm, setDeleteConfirm] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadInvoices = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoices?status=${filter}&search=${search}`);
      const data = await res.json();
      setInvoices(data.invoices || []);
    } finally { setLoading(false); }
  }, [filter, search]);

  const loadMeta = useCallback(async () => {
    const [cRes, pRes, tRes, sRes] = await Promise.all([
      fetch("/api/config/clients").then(r => r.json()),
      fetch("/api/projects").then(r => r.json()),
      fetch("/api/teams").then(r => r.json()),
      fetch("/api/invoices/settings").then(r => r.json()).catch(() => ({ settings: EMPTY_SETTINGS })),
    ]);
    setClients(cRes.clients || []);
    setProjects(pRes.projects || []);
    setTeams(tRes.teams || []);
    if (sRes.settings) setSettings({ ...EMPTY_SETTINGS, ...sRes.settings });
  }, []);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  useEffect(() => {
    const channel = supabase.channel("invoices-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, loadInvoices)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadInvoices]);

  const handlePreview = async (inv: Invoice) => {
    const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", inv.id).order("sort_order");
    setPreviewInv({ ...inv, invoice_items: items || [] });
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/invoices/${deleteConfirm.id}`, { method: "DELETE" });
      if (res.ok) {
        setInvoices(prev => prev.filter(i => i.id !== deleteConfirm.id));
        toast.success("Invoice deleted");
        setDeleteConfirm(null);
      } else toast.error("Failed to delete invoice");
    } catch { toast.error("Failed to delete invoice"); } finally { setDeleting(false); }
  };

  const filtered = invoices.filter(inv => {
    const s = search.toLowerCase();
    return (!s || inv.invoice_number?.toLowerCase().includes(s) || inv.clients?.name?.toLowerCase().includes(s))
      && (filter === "all" || inv.status === filter);
  });

  const totalReceivable = invoices.reduce((s, i) => s + (i.total || 0), 0);
  const paid = invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.total || 0), 0);
  const outstanding = invoices.filter(i => i.status === "sent").reduce((s, i) => s + (i.total || 0), 0);
  const overdue = invoices.filter(i => i.status === "overdue").length;

  const stats = [
    { label: "Total Receivable", value: fmt(totalReceivable), icon: IndianRupee,  tone: "text-foreground",  bg: "bg-muted" },
    { label: "Collected",        value: fmt(paid),            icon: CheckCircle2, tone: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: "Outstanding",      value: fmt(outstanding),     icon: Clock,        tone: "text-sky-600",     bg: "bg-sky-500/10" },
    { label: "Overdue",          value: String(overdue),      icon: AlertCircle,  tone: "text-rose-500",    bg: "bg-rose-500/10" },
  ];

  return (
    <DashboardShell
      moduleKey="invoicing"
      title="Invoicing"
      subtitle="Manage GST invoices, track payments, and monitor receivables."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setShowSettings(true)} title="Invoice Settings">
            <Settings size={15} />
          </Button>
          {canCreate && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus size={14} /> Create Invoice
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
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

        <Card className="p-0 overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={filter} onValueChange={setFilter}>
              <TabsList>
                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                <TabsTrigger value="draft" className="text-xs">Draft</TabsTrigger>
                <TabsTrigger value="sent" className="text-xs">Sent</TabsTrigger>
                <TabsTrigger value="paid" className="text-xs">Paid</TabsTrigger>
                <TabsTrigger value="overdue" className="text-xs">Overdue</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoices…" className="h-8 w-52 pl-8 text-xs" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">No invoices found</TableCell>
                  </TableRow>
                ) : filtered.map(inv => (
                  <TableRow key={inv.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <FileText size={13} />
                        </div>
                        <span className="text-sm font-semibold text-foreground tabular-nums">{inv.invoice_number}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-medium text-foreground">{inv.clients?.name || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{inv.projects?.name || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{inv.teams?.name || "—"}</TableCell>
                    <TableCell className="text-sm font-semibold text-emerald-600 tabular-nums">{fmt(inv.total)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(inv.issued_date)}</TableCell>
                    <TableCell className={cn("text-xs", inv.status === "overdue" ? "font-semibold text-rose-500" : "text-muted-foreground")}>
                      {fmtDate(inv.due_date)}
                    </TableCell>
                    <TableCell>{statusBadge(inv.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Preview Invoice" onClick={() => handlePreview(inv)}>
                          <Eye size={13} />
                        </Button>
                        {canExport && (
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Download PDF" onClick={() => handlePreview(inv)}>
                            <Download size={13} />
                          </Button>
                        )}
                        {canDelete && (
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10" title="Delete" onClick={() => setDeleteConfirm(inv)}>
                            <Trash2 size={13} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-2.5">
            <span className="text-xs text-muted-foreground">{filtered.length} invoice{filtered.length !== 1 ? "s" : ""}</span>
            <span className="text-xs text-muted-foreground">
              Showing total: <span className="font-semibold text-foreground tabular-nums">{fmt(filtered.reduce((s, i) => s + (i.total || 0), 0))}</span>
            </span>
          </div>
        </Card>
      </div>

      <InvoiceModal
        open={showForm}
        onClose={() => setShowForm(false)}
        onSaved={loadInvoices}
        clients={clients}
        projects={projects}
        teams={teams}
        settings={settings}
      />

      {previewInv && (
        <PreviewModal invoice={previewInv} onClose={() => setPreviewInv(null)} settings={settings} />
      )}

      <InvoiceSettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        initial={settings}
        onSaved={(s) => setSettings({ ...EMPTY_SETTINGS, ...s })}
      />

      <AlertDialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">&ldquo;{deleteConfirm?.invoice_number}&rdquo;</span> will be permanently removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDelete(); }} className="bg-destructive text-white hover:bg-destructive/90">
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  );
}
