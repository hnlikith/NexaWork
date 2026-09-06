"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/layout/AuthProvider";
import { ShareModal } from "@/components/workspace/ShareModal";
import {
  ArrowLeft, Plus, MoreVertical, Share2, Bold, Italic,
  AlignLeft, AlignCenter, AlignRight, FileSpreadsheet, Download,
  Sparkles, Filter, Sigma, X, Search,
  Strikethrough, Underline, BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import axios from "axios";
import dayjs from "@/lib/dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, AreaChart, Area
} from "recharts";

dayjs.extend(relativeTime);

interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;
}

interface SheetData {
  name: string;
  data: string[][];
  styles?: Record<string, CellStyle>;
  colWidths: number[];
}

interface SpreadsheetDoc {
  id: string;
  title: string;
  icon: string;
  sheets: SheetData[];
  is_pinned: boolean;
  last_edited_at: string;
  owner_id?: string;
}

const COLS = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"];

function ensureSize(data: string[][], rows: number, cols: number): string[][] {
  const out: string[][] = [];
  for (let r = 0; r < rows; r++) {
    const row = data[r] || [];
    const newRow: string[] = [];
    for (let c = 0; c < cols; c++) newRow.push(row[c] ?? "");
    out.push(newRow);
  }
  return out;
}

function evaluateFormula(formula: string, data: string[][]): string {
  if (!formula.startsWith("=")) return formula;
  try {
    const expr = formula.slice(1).toUpperCase();

    const aggMatch = expr.match(/^(SUM|AVERAGE|MIN|MAX|PRODUCT|COUNT)\((.*)\)$/);
    if (aggMatch) {
      const func = aggMatch[1];
      const argsStr = aggMatch[2];
      const vals: number[] = [];

      const args = argsStr.split(",").map(a => a.trim());
      args.forEach(arg => {
        if (arg.includes(":")) {
          const [start, end] = arg.split(":");
          getCellRange(start, end, data).forEach(v => vals.push(parseFloat(v) || 0));
        } else if (arg.match(/^[A-Z]+\d+$/)) {
          const col = COLS.indexOf(arg.replace(/\d+/, ""));
          const row = parseInt(arg.replace(/[A-Z]+/, "")) - 1;
          vals.push(parseFloat(data[row]?.[col]) || 0);
        } else {
          vals.push(parseFloat(arg) || 0);
        }
      });

      if (func === "SUM") return String(vals.reduce((a, b) => a + b, 0));
      if (func === "PRODUCT") return String(vals.reduce((a, b) => a * b, 1));
      if (func === "AVERAGE") return vals.length ? String(vals.reduce((a, b) => a + b, 0) / vals.length) : "0";
      if (func === "COUNT") return String(vals.filter(v => !isNaN(v)).length);
      if (func === "MIN") return String(Math.min(...vals));
      if (func === "MAX") return String(Math.max(...vals));
    }

    const ifMatch = expr.match(/^IF\((.*),(.*),(.*)\)$/);
    if (ifMatch) {
      const cond = ifMatch[1].trim();
      const trueVal = ifMatch[2].trim();
      const falseVal = ifMatch[3].trim();
      const res = evaluateArithmetic(cond.replace(/([A-Z]+\d+)/g, (match) => {
        const col = COLS.indexOf(match.replace(/\d+/, ""));
        const row = parseInt(match.replace(/[A-Z]+/, "")) - 1;
        const v = data[row]?.[col] || "0";
        return isNaN(parseFloat(v)) ? `"${v}"` : v;
      }));
      return res ? trueVal.replace(/^"|"$/g, "") : falseVal.replace(/^"|"$/g, "");
    }

    const concatMatch = expr.match(/^CONCATENATE\((.*)\)$/);
    if (concatMatch) {
      return concatMatch[1].split(",").map(a => {
        const arg = a.trim();
        if (arg.match(/^[A-Z]+\d+$/)) {
          const col = COLS.indexOf(arg.replace(/\d+/, ""));
          const row = parseInt(arg.replace(/[A-Z]+/, "")) - 1;
          return data[row]?.[col] || "";
        }
        return arg.replace(/^"|"$/g, "");
      }).join("");
    }

    const refMatch = expr.match(/^([A-Z]+)(\d+)$/);
    if (refMatch) {
      const col = COLS.indexOf(refMatch[1]);
      const row = parseInt(refMatch[2]) - 1;
      if (col >= 0 && row >= 0 && data[row]) return data[row][col] ?? "";
    }

    return String(evaluateArithmetic(expr));
  } catch {
    return "#ERR";
  }
}

function evaluateArithmetic(expr: string): any {
  const safe = expr.replace(/[^0-9+\-*/(). <>!=&|]/g, "");
  // eslint-disable-next-line no-eval
  return Function(`"use strict"; return (${safe})`)();
}

function getCellRange(start: string, end: string, data: string[][]): string[] {
  const startCol = COLS.indexOf(start.replace(/\d+/, ""));
  const startRow = parseInt(start.replace(/[A-Z]+/, "")) - 1;
  const endCol = COLS.indexOf(end.replace(/\d+/, ""));
  const endRow = parseInt(end.replace(/[A-Z]+/, "")) - 1;
  const vals: string[] = [];
  for (let r = startRow; r <= endRow; r++)
    for (let c = startCol; c <= endCol; c++)
      if (data[r]) vals.push(data[r][c] ?? "");
  return vals;
}

export default function SpreadsheetEditorPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [doc, setDoc] = useState<SpreadsheetDoc | null>(null);
  const [title, setTitle] = useState("Untitled Spreadsheet");
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null);
  const [editCell, setEditCell] = useState<[number, number] | null>(null);
  const [formulaBar, setFormulaBar] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  const [showShare, setShowShare] = useState(false);

  const [showAI, setShowAI] = useState(false);
  const [aiAction, setAiAction] = useState("analyze_data");
  const [aiCustom, setAiCustom] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const [showFR, setShowFR] = useState(false);
  const [findTerm, setFindTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [matches, setMatches] = useState<[number, number][]>([]);
  const [matchIdx, setMatchIdx] = useState(0);

  const [showChart, setShowChart] = useState(false);
  const [chartType, setChartType] = useState<"bar" | "line" | "pie" | "area">("bar");
  const [chartData, setChartData] = useState<any[]>([]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ROWS = 50;
  const DISPLAY_COLS = 20;

  useEffect(() => { if (id && user?.id) fetchDoc(); }, [id, user?.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editCell || showFR || showAI) {
        if (e.key === "Escape") { setShowAI(false); setShowFR(false); setShowShare(false); }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "f") { e.preventDefault(); setShowFR(true); }
      if (e.key === "Escape") { setShowAI(false); setShowFR(false); setShowShare(false); }

      if (selectedCell) {
        const [r, c] = selectedCell;

        if (e.key === "ArrowUp") { e.preventDefault(); if (r > 0) setSelectedCell([r - 1, c]); }
        if (e.key === "ArrowDown") { e.preventDefault(); if (r < ROWS - 1) setSelectedCell([r + 1, c]); }
        if (e.key === "ArrowLeft") { e.preventDefault(); if (c > 0) setSelectedCell([r, c - 1]); }
        if (e.key === "ArrowRight") { e.preventDefault(); if (c < DISPLAY_COLS - 1) setSelectedCell([r, c + 1]); }

        if (e.key === "Enter") { e.preventDefault(); setEditCell([r, c]); }
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          updateCell(r, c, "");
        }

        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          setEditCell([r, c]);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedCell, editCell, showFR, showAI, ROWS, DISPLAY_COLS]);

  async function fetchDoc() {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await axios.get(`/api/workspace/spreadsheets/${id}?userId=${user.id}`);
      const d = res.data.spreadsheet;
      setDoc(d);
      setTitle(d.title);
      const normalized = (d.sheets || []).map((s: SheetData) => ({
        ...s,
        data: ensureSize(s.data || [], ROWS, DISPLAY_COLS),
        styles: s.styles || {},
        colWidths: s.colWidths?.length ? s.colWidths : Array(DISPLAY_COLS).fill(150),
      }));
      setSheets(normalized.length ? normalized : [{ name: "Sheet 1", data: ensureSize([], ROWS, DISPLAY_COLS), styles: {}, colWidths: Array(DISPLAY_COLS).fill(150) }]);
    } catch {
      router.push("/admin/workspace/spreadsheets");
    }
    finally { setLoading(false); }
  }

  function scheduleSave(updatedSheets: SheetData[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveSheets(updatedSheets), 1500);
  }

  async function saveSheets(updatedSheets: SheetData[]) {
    if (!user?.id) return;
    setSaving(true);
    try {
      await axios.patch(`/api/workspace/spreadsheets/${id}?userId=${user.id}`, { sheets: updatedSheets, last_edited_by: user.id });
      setSavedAt(new Date());
    } catch {} finally { setSaving(false); }
  }

  function saveTitle(val: string) {
    setTitle(val);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!user?.id) return;
      await axios.patch(`/api/workspace/spreadsheets/${id}?userId=${user.id}`, { title: val });
    }, 1000);
  }

  function updateCellStyle(row: number, col: number, style: Partial<CellStyle>) {
    const newSheets = sheets.map((s, si) => {
      if (si !== activeSheet) return s;
      const key = `${row}-${col}`;
      const styles = { ...s.styles };
      styles[key] = { ...(styles[key] || {}), ...style };
      return { ...s, styles };
    });
    setSheets(newSheets);
    scheduleSave(newSheets);
  }

  function updateCell(row: number, col: number, value: string) {
    const newSheets = sheets.map((s, si) => {
      if (si !== activeSheet) return s;
      const data = s.data.map((r, ri) =>
        ri === row ? r.map((c2, ci) => (ci === col ? value : c2)) : [...r]
      );
      return { ...s, data };
    });
    setSheets(newSheets);
    scheduleSave(newSheets);
  }

  function addRow() {
    const newSheets = sheets.map((s, si) => {
      if (si !== activeSheet) return s;
      return { ...s, data: [...s.data, Array(DISPLAY_COLS).fill("")] };
    });
    setSheets(newSheets);
    scheduleSave(newSheets);
  }

  function addCol() {
    const newSheets = sheets.map((s, si) => {
      if (si !== activeSheet) return s;
      return {
        ...s,
        data: s.data.map((r) => [...r, ""]),
        colWidths: [...s.colWidths, 150],
      };
    });
    setSheets(newSheets);
    scheduleSave(newSheets);
  }

  function addSheet() {
    const newSheet: SheetData = {
      name: `Sheet ${sheets.length + 1}`,
      data: ensureSize([], ROWS, DISPLAY_COLS),
      colWidths: Array(DISPLAY_COLS).fill(150),
    };
    const newSheets = [...sheets, newSheet];
    setSheets(newSheets);
    setActiveSheet(newSheets.length - 1);
    scheduleSave(newSheets);
  }

  function exportCSV() {
    const sheet = sheets[activeSheet];
    if (!sheet) return;
    const csv = sheet.data
      .filter((row) => row.some((c) => c !== ""))
      .map((row) => row.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runAI() {
    const sheet = sheets[activeSheet];
    const dataStr = sheet.data
      .filter((r) => r.some((c) => c !== ""))
      .slice(0, 30)
      .map((r) => r.join("\t"))
      .join("\n");
    setAiLoading(true);
    setAiResult("");
    try {
      const res = await axios.post("/api/workspace/ai", {
        action: aiAction,
        content: dataStr,
        customPrompt: aiCustom,
        context: `Spreadsheet: ${title}`,
      });
      setAiResult(res.data.result || "No result returned.");
    } catch {
      setAiResult("AI is unavailable. Make sure Ollama is running locally with the configured model.");
    } finally {
      setAiLoading(false);
    }
  }

  function findAll(term: string) {
    const sheet = sheets[activeSheet];
    const found: [number, number][] = [];
    sheet.data.forEach((row, ri) => row.forEach((cell, ci) => {
      if (cell.toLowerCase().includes(term.toLowerCase())) found.push([ri, ci]);
    }));
    setMatches(found);
    setMatchIdx(0);
    if (found.length) setSelectedCell(found[0]);
  }

  function replaceAll() {
    if (!findTerm) return;
    const newSheets = sheets.map((s, si) => {
      if (si !== activeSheet) return s;
      return {
        ...s,
        data: s.data.map((r) => r.map((c) => c.replace(new RegExp(findTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), replaceTerm))),
      };
    });
    setSheets(newSheets);
    scheduleSave(newSheets);
    setMatches([]);
  }

  function generateChart() {
    const sheet = sheets[activeSheet];
    if (!sheet) return;

    const dataRows = sheet.data.filter(r => r.some(c => c !== "")).slice(0, 10);
    const formatted = dataRows.map((r, i) => ({
      name: r[0] || `Row ${i + 1}`,
      value: parseFloat(r[1]) || 0,
      extra: parseFloat(r[2]) || 0,
    }));
    setChartData(formatted);
    setShowChart(true);
  }

  const currentSheet = sheets[activeSheet] || null;
  const cellRef = selectedCell ? `${COLS[selectedCell[1]] ?? selectedCell[1]}${selectedCell[0] + 1}` : "A1";
  const cellValue = selectedCell && currentSheet ? currentSheet.data[selectedCell[0]]?.[selectedCell[1]] ?? "" : "";

  useEffect(() => {
    setFormulaBar(cellValue);
  }, [selectedCell, cellValue]);

  useEffect(() => {
    if (editCell && inputRef.current) inputRef.current.focus();
  }, [editCell]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 w-72">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-[420px] w-full" />
          <Skeleton className="h-6 w-2/3" />
        </div>
      </div>
    );
  }

  const styleAtSelected = selectedCell && currentSheet
    ? currentSheet.styles?.[`${selectedCell[0]}-${selectedCell[1]}`]
    : undefined;

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* HEADER */}
      <header className="h-14 bg-primary flex items-center justify-between px-4 z-50 shadow-sm flex-shrink-0 border-b border-border">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Link
            href="/admin/workspace/spreadsheets"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors flex-shrink-0"
          >
            <ArrowLeft size={16} />
          </Link>
          <Separator orientation="vertical" className="bg-white/20 h-6" />
          <div className="text-xl bg-white/10 px-1.5 py-1 rounded-md flex-shrink-0">{doc?.icon ?? "📊"}</div>
          <div className="flex flex-col flex-1 min-w-0">
            <Input
              value={title}
              onChange={(e) => saveTitle(e.target.value)}
              className="h-7 bg-transparent border-0 px-0 font-semibold text-white text-sm focus-visible:ring-0 placeholder:text-white/40 truncate"
              placeholder="Untitled Spreadsheet"
            />
            <p className="text-xs text-white/70 flex items-center gap-1.5">
              <FileSpreadsheet size={10} />
              NexaWork Sheets
              <span className="opacity-40">·</span>
              {saving ? "Saving…" : savedAt ? `Saved ${dayjs(savedAt).fromNow()}` : `Edited ${dayjs(doc?.last_edited_at).fromNow()}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            type="button"
            onClick={() => setShowShare(true)}
            size="sm"
            className="h-8 bg-white/15 hover:bg-white/25 text-white"
          >
            <Share2 size={13} className="mr-1.5" /> Share
          </Button>
          <Button
            type="button"
            onClick={() => setShowAI(!showAI)}
            size="sm"
            className={cn(
              "h-8",
              showAI ? "bg-white text-primary hover:bg-white/90" : "bg-white/15 hover:bg-white/25 text-white"
            )}
          >
            <Sparkles size={13} className="mr-1.5" /> AI
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 bg-white/15 hover:bg-white/25 text-white"
              >
                <MoreVertical size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={exportCSV}>
                <Download size={13} className="mr-2 text-primary" /> Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowFR(true)}>
                <Search size={13} className="mr-2 text-amber-500" /> Find & Replace
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/admin/workspace/spreadsheets")}>
                <ArrowLeft size={13} className="mr-2 text-muted-foreground" /> Back to list
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* FORMULA BAR */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-card border-b border-border flex-shrink-0">
        <div className="flex items-center bg-muted/40 border border-border rounded-md px-3 h-8 min-w-[64px]">
          <span className="text-xs font-semibold text-primary">{cellRef}</span>
        </div>
        <Separator orientation="vertical" className="h-6" />
        <span className="text-xs text-muted-foreground">ƒx</span>
        <Input
          value={formulaBar}
          onChange={(e) => {
            setFormulaBar(e.target.value);
            if (selectedCell) updateCell(selectedCell[0], selectedCell[1], e.target.value);
          }}
          placeholder="Enter value or formula (e.g. =SUM(A1:A10))"
          className="h-8 flex-1 bg-transparent border-0 focus-visible:ring-0 text-xs"
        />
      </div>

      {/* TOOLBAR */}
      <div className="flex items-center gap-1 px-3 py-1.5 bg-card border-b border-border overflow-x-auto flex-shrink-0">
        <Button
          type="button"
          variant={styleAtSelected?.bold ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => selectedCell && currentSheet && updateCellStyle(selectedCell[0], selectedCell[1], { bold: !styleAtSelected?.bold })}
          title="Bold"
        >
          <Bold size={14} />
        </Button>
        <Button
          type="button"
          variant={styleAtSelected?.italic ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => selectedCell && currentSheet && updateCellStyle(selectedCell[0], selectedCell[1], { italic: !styleAtSelected?.italic })}
          title="Italic"
        >
          <Italic size={14} />
        </Button>
        <Button
          type="button"
          variant={styleAtSelected?.underline ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => selectedCell && currentSheet && updateCellStyle(selectedCell[0], selectedCell[1], { underline: !styleAtSelected?.underline })}
          title="Underline"
        >
          <Underline size={14} />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Strikethrough" disabled>
          <Strikethrough size={14} />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <ToggleGroup
          type="single"
          value={styleAtSelected?.align || ""}
          onValueChange={(v) => {
            if (!v || !selectedCell || !currentSheet) return;
            updateCellStyle(selectedCell[0], selectedCell[1], { align: v as 'left' | 'center' | 'right' });
          }}
          size="sm"
        >
          <ToggleGroupItem value="left" title="Align left"><AlignLeft size={14} /></ToggleGroupItem>
          <ToggleGroupItem value="center" title="Align center"><AlignCenter size={14} /></ToggleGroupItem>
          <ToggleGroupItem value="right" title="Align right"><AlignRight size={14} /></ToggleGroupItem>
        </ToggleGroup>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={addRow}>
          <Plus size={12} className="mr-1" /> Row
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={addCol}>
          <Plus size={12} className="mr-1" /> Col
        </Button>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Filter" disabled>
          <Filter size={14} />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Formula" disabled>
          <Sigma size={14} />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={generateChart} title="Chart">
          <BarChart2 size={14} />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Button
          type="button"
          variant={showAI ? "default" : "outline"}
          size="sm"
          className="h-8"
          onClick={() => setShowAI(!showAI)}
        >
          <Sparkles size={12} className="mr-1.5" /> AI Assist
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => setShowFR(true)}
        >
          <Search size={12} className="mr-1" /> Find
        </Button>
      </div>

      {/* MAIN */}
      <div className="flex flex-1 overflow-hidden min-w-0">
        <div className="flex-1 overflow-auto bg-muted/30">
          {currentSheet && (
            <table className="border-collapse text-xs table-fixed" style={{ width: "max-content" }}>
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="w-12 bg-muted/50 border border-border" />
                  {currentSheet.data[0]?.map((_, ci) => (
                    <th
                      key={ci}
                      style={{ width: currentSheet.colWidths[ci] ?? 150 }}
                      className="bg-muted/50 border border-border px-2 py-1.5 text-center text-muted-foreground font-semibold select-none text-[11px]"
                    >
                      {COLS[ci] ?? ci}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentSheet.data.map((row, ri) => (
                  <tr key={ri} className="group">
                    <td className="w-12 bg-muted/50 border border-border px-2 py-1 text-center text-muted-foreground font-medium select-none text-[11px]">
                      {ri + 1}
                    </td>
                    {row.map((cell, ci) => {
                      const isSelected = selectedCell?.[0] === ri && selectedCell?.[1] === ci;
                      const isEditing = editCell?.[0] === ri && editCell?.[1] === ci;
                      const isMatch = matches.some(([r, c]) => r === ri && c === ci);
                      const displayVal = cell.startsWith("=") ? evaluateFormula(cell, currentSheet.data) : cell;
                      return (
                        <td
                          key={ci}
                          style={{ width: currentSheet.colWidths[ci] ?? 150 }}
                          onClick={() => { setSelectedCell([ri, ci]); setFormulaBar(cell); }}
                          onDoubleClick={() => setEditCell([ri, ci])}
                          className={cn(
                            "border border-border/60 relative p-0 h-8 transition-colors bg-card",
                            isSelected && !isEditing && "ring-2 ring-primary ring-inset z-10 bg-primary/5",
                            isMatch && !isSelected && "bg-amber-500/10",
                            !isSelected && !isMatch && "hover:bg-muted/50"
                          )}
                        >
                          {isEditing ? (
                            <input
                              ref={inputRef}
                              defaultValue={cell}
                              onBlur={(e) => { updateCell(ri, ci, e.target.value); setEditCell(null); setFormulaBar(e.target.value); }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  updateCell(ri, ci, (e.target as HTMLInputElement).value);
                                  setEditCell(null);
                                  setSelectedCell([ri + 1, ci]);
                                }
                                if (e.key === "Tab") {
                                  e.preventDefault();
                                  updateCell(ri, ci, (e.target as HTMLInputElement).value);
                                  setEditCell(null);
                                  setSelectedCell([ri, ci + 1]);
                                }
                                if (e.key === "Escape") setEditCell(null);
                              }}
                              className="absolute inset-0 w-full h-full px-2 bg-card text-foreground text-xs font-medium focus:outline-none z-20 shadow-md"
                            />
                          ) : (
                            <div
                              className={cn(
                                "px-2 py-1 truncate text-xs",
                                displayVal === "#ERR" ? "text-destructive" : "text-foreground"
                              )}
                              style={{
                                fontWeight: currentSheet.styles?.[`${ri}-${ci}`]?.bold ? 'bold' : 'normal',
                                fontStyle: currentSheet.styles?.[`${ri}-${ci}`]?.italic ? 'italic' : 'normal',
                                textDecoration: currentSheet.styles?.[`${ri}-${ci}`]?.underline ? 'underline' : 'none',
                                textAlign: currentSheet.styles?.[`${ri}-${ci}`]?.align || 'left',
                                color: currentSheet.styles?.[`${ri}-${ci}`]?.color || undefined
                              }}
                            >
                              {displayVal}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* AI PANEL */}
        {showAI && (
          <aside className="w-80 flex-shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-primary" />
                <span className="text-sm font-semibold">AI Assist</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowAI(false)}
              >
                <X size={14} />
              </Button>
            </div>

            <div className="p-4 space-y-3 flex-1 overflow-y-auto">
              <div className="space-y-1.5">
                <Label className="text-xs">What to do</Label>
                <Select value={aiAction} onValueChange={setAiAction}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Data Analysis</SelectLabel>
                      <SelectItem value="analyze_data">Analyze & summarize data</SelectItem>
                      <SelectItem value="predict_values">Predict next values</SelectItem>
                      <SelectItem value="clean_data">Suggest data cleaning</SelectItem>
                      <SelectItem value="chart_suggest">Suggest best chart type</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Formulas</SelectLabel>
                      <SelectItem value="formula_explain">Explain a formula</SelectItem>
                      <SelectItem value="formula_suggest">Suggest a formula</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Content</SelectLabel>
                      <SelectItem value="natural_query">Ask a question about data</SelectItem>
                      <SelectItem value="generate_data">Generate sample data</SelectItem>
                      <SelectItem value="summarize">Summarize content</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              {(aiAction === "formula_explain" || aiAction === "formula_suggest" || aiAction === "natural_query" || aiAction === "generate_data") && (
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {aiAction === "formula_explain" ? "Paste the formula" :
                     aiAction === "formula_suggest" ? "What do you want to calculate?" :
                     aiAction === "natural_query" ? "Your question" :
                     "Describe the data to generate"}
                  </Label>
                  <Textarea
                    value={aiCustom}
                    onChange={(e) => setAiCustom(e.target.value)}
                    rows={3}
                    placeholder={
                      aiAction === "formula_explain" ? "e.g. =VLOOKUP(A2,B:C,2,FALSE)" :
                      aiAction === "formula_suggest" ? "e.g. Calculate total sales for Q1" :
                      aiAction === "natural_query" ? "e.g. What is the average of column B?" :
                      "e.g. Employee attendance data with Name, Date, Status"
                    }
                    className="resize-none text-xs"
                  />
                </div>
              )}

              <Button
                type="button"
                onClick={runAI}
                disabled={aiLoading}
                size="sm"
                className="w-full"
              >
                {aiLoading ? (
                  <>
                    <div className="h-3 w-3 mr-1.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Thinking…
                  </>
                ) : (
                  <><Sparkles size={12} className="mr-1.5" /> Run AI</>
                )}
              </Button>

              {aiResult && (
                <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground">Result</p>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => navigator.clipboard.writeText(aiResult)}
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{aiResult}</p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* SHEET TABS */}
      <footer className="h-10 bg-card border-t border-border flex items-center justify-between px-3 z-50 flex-shrink-0">
        <div className="flex items-center gap-0.5 h-full">
          {sheets.map((s, i) => (
            <button
              key={i}
              onClick={() => setActiveSheet(i)}
              className={cn(
                "px-4 h-full flex items-center text-xs font-medium transition-colors border-b-2",
                activeSheet === i
                  ? "text-primary border-primary bg-primary/5"
                  : "text-muted-foreground border-transparent hover:bg-muted/50"
              )}
            >
              {s.name}
            </button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 ml-1"
            onClick={addSheet}
          >
            <Plus size={13} />
          </Button>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span>{currentSheet?.data.length ?? 0} rows · {currentSheet?.data[0]?.length ?? 0} cols</span>
          {selectedCell && <span className="text-primary font-semibold">{cellRef} selected</span>}
        </div>
      </footer>

      {/* FIND & REPLACE */}
      <Dialog open={showFR} onOpenChange={setShowFR}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Find & Replace</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Find</Label>
              <Input
                autoFocus
                value={findTerm}
                onChange={(e) => { setFindTerm(e.target.value); findAll(e.target.value); }}
                placeholder="Search term…"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Replace with</Label>
              <Input
                value={replaceTerm}
                onChange={(e) => setReplaceTerm(e.target.value)}
                placeholder="Replacement…"
              />
            </div>
            {matches.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {matches.length} match{matches.length !== 1 ? "es" : ""} found
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowFR(false)}>Close</Button>
            <Button type="button" onClick={replaceAll}>Replace All</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CHART MODAL */}
      <Dialog open={showChart} onOpenChange={setShowChart}>
        <DialogContent className="sm:max-w-4xl !grid-rows-[auto_1fr_auto] !grid max-h-[calc(100vh-6rem)]">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <DialogTitle className="flex items-center gap-2">
                <BarChart2 size={16} className="text-primary" /> Chart: {title}
              </DialogTitle>
              <ToggleGroup
                type="single"
                value={chartType}
                onValueChange={(v) => v && setChartType(v as typeof chartType)}
                size="sm"
              >
                <ToggleGroupItem value="bar" className="text-xs capitalize">Bar</ToggleGroupItem>
                <ToggleGroupItem value="line" className="text-xs capitalize">Line</ToggleGroupItem>
                <ToggleGroupItem value="area" className="text-xs capitalize">Area</ToggleGroupItem>
                <ToggleGroupItem value="pie" className="text-xs capitalize">Pie</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-[420px] p-4 bg-muted/30 rounded-md border border-border">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "bar" ? (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="extra" fill="var(--chart-2, #3B82F6)" radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : chartType === "line" ? (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="extra" stroke="var(--chart-2, #3B82F6)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              ) : chartType === "area" ? (
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12 }} />
                  <defs>
                    <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="value" stroke="var(--primary)" fillOpacity={1} fill="url(#colorVal)" />
                </AreaChart>
              ) : (
                <PieChart>
                  <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120} label>
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={["var(--primary)", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6"][index % 5]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowChart(false)}>Close Chart</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SHARE MODAL */}
      {showShare && doc && user && (
        <ShareModal
          itemId={id}
          itemType="spreadsheet"
          itemTitle={title}
          currentUserId={user.id}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
