"use client";

import React, { useCallback, useState } from "react";
import { FileSpreadsheet, CheckCircle, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import type { SandboxPlan, PlanRow } from "./types";

type Step = "drop" | "sheet" | "year" | "parsing" | "review" | "error";

// Social platforms commonly used for both paid and organic; linkedin omitted (almost always paid)
const SOCIAL_SUSPECT_TERMS = ['facebook', 'fb', 'instagram', 'ig', 'twitter', 'tiktok', 'tik tok', 'pinterest', 'snapchat', 'x.com'];
const PAID_DISQUALIFIERS   = ['ads', 'paid', 'sem', 'ppc', 'search', 'shopping', 'performance max', 'pmax', 'google', 'youtube', 'display', 'programmatic', 'retargeting'];

// Channels we can confidently label organic without asking the user
function isDefinitelyOrganic(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  if (lower.includes('organic')) return true;
  // Two or more social platforms in one cell → clearly an organic posting row (e.g. "FB & IG")
  return SOCIAL_SUSPECT_TERMS.filter(t => lower.includes(t)).length >= 2;
}

// Channels that might be organic — show to user for confirmation
function isPotentiallyOrganic(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  if (isDefinitelyOrganic(name)) return false; // handled separately, no need to ask
  if (PAID_DISQUALIFIERS.some(t => lower.includes(t))) return false;
  return SOCIAL_SUSPECT_TERMS.some(t => lower.includes(t));
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2];

interface Props {
  onPlanLoaded: (plan: SandboxPlan) => void;
}

function formatBudget(n: number): string {
  return "$" + n.toLocaleString();
}

function totalBudget(rows: PlanRow[]): number {
  return rows.reduce((sum, r) => sum + r.flights.reduce((s, f) => s + f.budget, 0), 0);
}

function SpreadsheetDiagram() {
  // Layout constants — spreadsheet starts at (padL, padT) inside the viewBox
  const padL = 138; // room for left callout
  const padT = 46;  // room for top callout

  const colW = [72, 80, 80, 46, 46, 46, 46];
  const rowH = 28;
  const headerH = 30;
  const totalsH = 28;
  const cols = ["FUNNEL", "CHANNEL", "DETAIL", "5-Jan", "12-Jan", "19-Jan", "26-Jan"];
  const dataRows = [
    { funnel: "AWARENESS", channel: "FACEBOOK", detail: "Brand Content", flights: [null, "green", "green", null] as (string | null)[] },
    { funnel: "",          channel: "SEARCH",   detail: "Keywords",      flights: [null, "blue",  "blue",  "blue"] as (string | null)[] },
    { funnel: "RETARGETING", channel: "META",   detail: "Site Visitors", flights: ["orange", "orange", null, null] as (string | null)[] },
  ];

  const colX = colW.reduce<number[]>((acc, w) => { acc.push((acc[acc.length - 1] ?? 0) + w); return acc; }, [0]);
  const gridW = colW.reduce((a, b) => a + b, 0);
  const gridH = headerH + dataRows.length * rowH + totalsH;
  const vbW = padL + gridW + 8;
  const vbH = padT + gridH + 8;

  const flightColors: Record<string, { bg: string; text: string }> = {
    green:  { bg: "#4caf50", text: "#fff" },
    blue:   { bg: "#2563eb", text: "#fff" },
    orange: { bg: "#e8703a", text: "#fff" },
  };

  // Callout positions (absolute in viewBox coords)
  const dateCalloutX = padL + colX[3]; // left edge of first date col
  const dateCalloutY = padT;           // top of header
  const borderCalloutMidY = padT + headerH + rowH; // mid of second data row

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        width="100%"
        style={{ display: "block", margin: "0 auto" }}
        fontFamily="system-ui, sans-serif"
      >
        <defs>
          <marker id="arrowA" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#f59e0b" />
          </marker>
          <marker id="arrowB" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#f59e0b" />
          </marker>
        </defs>

        {/* ── Top callout: W/C dates ── */}
        <rect x={dateCalloutX} y={2} width={gridW - colX[3]} height={20} rx={4} fill="#fef3c7" stroke="#f59e0b" strokeWidth={1} />
        <text x={dateCalloutX + (gridW - colX[3]) / 2} y={15} textAnchor="middle" fontSize={8.5} fontWeight="600" fill="#92400e">
          W/C date headers — must be real Excel dates (e.g. 5-Jan)
        </text>
        <line
          x1={dateCalloutX + (gridW - colX[3]) / 2} y1={22}
          x2={dateCalloutX + (gridW - colX[3]) / 2} y2={dateCalloutY - 2}
          stroke="#f59e0b" strokeWidth={1.5} markerEnd="url(#arrowA)"
        />

        {/* ── Left callout: cell borders ── */}
        <rect x={2} y={borderCalloutMidY - 11} width={130} height={22} rx={4} fill="#fef3c7" stroke="#f59e0b" strokeWidth={1} />
        <text x={67} y={borderCalloutMidY - 1} textAnchor="middle" fontSize={8.5} fontWeight="600" fill="#92400e">All cells need</text>
        <text x={67} y={borderCalloutMidY + 9} textAnchor="middle" fontSize={8.5} fontWeight="600" fill="#92400e">clear borders</text>
        <line
          x1={133} y1={borderCalloutMidY}
          x2={padL - 2} y2={borderCalloutMidY}
          stroke="#f59e0b" strokeWidth={1.5} markerEnd="url(#arrowB)"
        />

        {/* ── Spreadsheet grid ── */}
        <g transform={`translate(${padL}, ${padT})`}>
          {/* Header */}
          <rect x={0} y={0} width={gridW} height={headerH} fill="#1e293b" />
          {cols.map((label, ci) => {
            const x = colX[ci];
            const w = colW[ci];
            const isDate = ci >= 3;
            return (
              <g key={ci}>
                <rect x={x} y={0} width={w} height={headerH} fill="none" stroke="#334155" strokeWidth={0.5} />
                <text x={x + w / 2} y={headerH / 2 + 5} textAnchor="middle" fontSize={isDate ? 9 : 8} fontWeight="600" fill={isDate ? "#93c5fd" : "#94a3b8"}>
                  {label}
                </text>
              </g>
            );
          })}

          {/* Data rows */}
          {dataRows.map((row, ri) => {
            const y = headerH + ri * rowH;
            const bg = ri % 2 === 0 ? "#fff" : "#f8fafc";
            return (
              <g key={ri}>
                <rect x={0} y={y} width={gridW} height={rowH} fill={bg} />
                <rect x={colX[0]} y={y} width={colW[0]} height={rowH} fill="none" stroke="#e2e8f0" strokeWidth={0.75} />
                <text x={colX[0] + 6} y={y + rowH / 2 + 4} fontSize={7.5} fontWeight="600" fill="#374151">{row.funnel}</text>
                <rect x={colX[1]} y={y} width={colW[1]} height={rowH} fill="none" stroke="#e2e8f0" strokeWidth={0.75} />
                <text x={colX[1] + 6} y={y + rowH / 2 + 4} fontSize={7.5} fontWeight="600" fill="#374151">{row.channel}</text>
                <rect x={colX[2]} y={y} width={colW[2]} height={rowH} fill="none" stroke="#e2e8f0" strokeWidth={0.75} />
                <text x={colX[2] + 6} y={y + rowH / 2 + 4} fontSize={7} fill="#6b7280">{row.detail}</text>
                {row.flights.map((f, fi) => {
                  const ci = fi + 3;
                  const cx = colX[ci];
                  const cw = colW[ci];
                  const color = f ? flightColors[f] : null;
                  return (
                    <g key={fi}>
                      <rect x={cx} y={y} width={cw} height={rowH} fill={color ? color.bg : bg} stroke="#e2e8f0" strokeWidth={0.75} />
                      {color && (
                        <text x={cx + cw / 2} y={y + rowH / 2 + 4} textAnchor="middle" fontSize={7} fontWeight="600" fill={color.text}>
                          $1k
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Totals row */}
          {(() => {
            const y = headerH + dataRows.length * rowH;
            return (
              <g>
                <rect x={0} y={y} width={gridW} height={totalsH} fill="#1e293b" />
                <text x={8} y={y + 18} fontSize={8} fontWeight="700" fill="#f1f5f9">TOTAL</text>
                {[3, 4, 5, 6].map(ci => (
                  <g key={ci}>
                    <rect x={colX[ci]} y={y} width={colW[ci]} height={totalsH} fill="none" stroke="#334155" strokeWidth={0.5} />
                    <text x={colX[ci] + colW[ci] / 2} y={y + 17} textAnchor="middle" fontSize={8} fontWeight="700" fill="#f1f5f9">
                      $3k
                    </text>
                  </g>
                ))}
              </g>
            );
          })()}

          {/* Border highlight box around data cells */}
          <rect x={0} y={headerH} width={gridW} height={dataRows.length * rowH} fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 2" />
        </g>
      </svg>
    </div>
  );
}

export function UploadWizard({ onPlanLoaded }: Props) {
  const [step, setStep] = useState<Step>("drop");
  const [errorMsg, setErrorMsg] = useState("");
  const [parsedPlan, setParsedPlan] = useState<SandboxPlan | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [parseProgress, setParseProgress] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingScratch, setPendingScratch] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  // channels that might be organic — shown as inline prompts on the review screen
  const [suspectChannels, setSuspectChannels] = useState<string[]>([]);
  // user answers: true = organic, false = paid; undefined = not yet answered
  const [organicOverrides, setOrganicOverrides] = useState<Record<string, boolean>>({});

  const parseFile = useCallback(async (file: File, year: number, sheetName: string) => {
    if (!file.name.match(/\.(xlsx?|xls)$/i)) {
      setErrorMsg("Please upload an Excel file (.xlsx or .xls)");
      setStep("error");
      return;
    }

    setStep("parsing");
    setParseProgress("Reading file...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("year", String(year));
    if (sheetName) formData.append("sheetName", sheetName);

    try {
      setParseProgress("Identifying columns and flights...");
      const res = await fetch("/api/sandbox/parse", { method: "POST", body: formData });
      const json = await res.json();

      if (!res.ok || json.error) {
        setErrorMsg(json.error ?? "Parse failed. Try again.");
        setStep("error");
        return;
      }

      const plan: SandboxPlan = json.plan;
      const uniqueChannels = [...new Set(plan.rows.map((r: any) => (r.channel || '').trim()).filter(Boolean))];

      // Auto-mark channels that are unambiguously organic (no user confirmation needed)
      const definiteOrganicSet = new Set(uniqueChannels.filter(isDefinitelyOrganic));
      const planWithDefiniteOrganics: SandboxPlan = definiteOrganicSet.size > 0 ? {
        ...plan,
        rows: plan.rows.map((r: any) => ({
          ...r,
          isOrganic: definiteOrganicSet.has((r.channel || '').trim()) ? true : r.isOrganic,
        })),
      } : plan;
      setParsedPlan(planWithDefiniteOrganics);

      // Store ambiguous channels — inline prompts will appear on the review screen
      const suspects = uniqueChannels.filter(isPotentiallyOrganic);
      setSuspectChannels(suspects);
      setOrganicOverrides({});
      setStep("review");
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStep("error");
    }
  }, []);

  const probeSheets = useCallback(async (file: File): Promise<string[]> => {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/sandbox/sheets", { method: "POST", body: fd });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json.sheets) ? json.sheets : [];
    } catch {
      return [];
    }
  }, []);

  const handleFileSelected = useCallback(async (file: File) => {
    setPendingFile(file);
    setPendingScratch(false);
    const sheets = await probeSheets(file);
    setAvailableSheets(sheets);
    if (sheets.length > 1) {
      setSelectedSheet(sheets[0]);
      setStep("sheet");
    } else {
      setSelectedSheet(sheets[0] ?? "");
      setStep("year");
    }
  }, [probeSheets]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  }, [handleFileSelected]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
    e.target.value = "";
  }, [handleFileSelected]);

  const handleYearConfirm = useCallback(() => {
    if (pendingScratch) {
      const year = selectedYear;
      const jan1 = new Date(year, 0, 1);
      const dayOfWeek = jan1.getDay();
      const daysToMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
      const firstMonday = new Date(year, 0, 1 + daysToMonday);
      firstMonday.setHours(0, 0, 0, 0);

      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const monthsFull = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
      const weeks = Array.from({ length: 52 }, (_, i) => {
        const d = new Date(firstMonday);
        d.setDate(firstMonday.getDate() + i * 7);
        const thu = new Date(d.getTime() + 3 * 86400000); // Thursday determines the month
        const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        return {
          weekStart: iso,
          label: `${d.getDate()}-${months[d.getMonth()]}`,
          month: monthsFull[thu.getMonth()],
          year: thu.getFullYear(),
        };
      });

      const plan: SandboxPlan = {
        id: Math.random().toString(36).slice(2),
        title: "New Media Plan",
        asAtLabel: "",
        weeks,
        rows: [{
          id: Math.random().toString(36).slice(2),
          funnel: "AWARENESS",
          channel: "Channel 1",
          detail: "",
          audience: "",
          flights: [],
        }],
        updatedAt: new Date().toISOString(),
      };
      onPlanLoaded(plan);
    } else if (pendingFile) {
      parseFile(pendingFile, selectedYear, selectedSheet);
    }
  }, [pendingScratch, pendingFile, selectedYear, selectedSheet, parseFile, onPlanLoaded]);

  // ── Drop zone ──────────────────────────────────────────────────────────────
  if (step === "drop") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-8">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Media Plan</h1>
            <p className="text-gray-500 mt-1 text-sm">Upload an existing Excel plan or start from scratch</p>
          </div>

          <label
            className={`flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
              isDraggingOver
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/40"
            }`}
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setIsDraggingOver(true); }}
            onDragLeave={() => setIsDraggingOver(false)}
          >
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileInput} />
            <FileSpreadsheet
              className={`w-12 h-12 mb-3 transition-colors ${isDraggingOver ? "text-blue-500" : "text-gray-400"}`}
            />
            <span className="text-sm font-medium text-gray-700">
              {isDraggingOver ? "Drop to upload" : "Drop your Excel media plan here"}
            </span>
            <span className="text-xs text-gray-400 mt-1">or click to browse — .xlsx / .xls</span>
          </label>

          <div className="flex items-center gap-3 my-6">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <button
            onClick={() => { setPendingFile(null); setPendingScratch(true); setStep("year"); }}
            className="w-full py-3 px-4 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            Start from scratch (blank plan)
          </button>
        </div>
      </div>
    );
  }

  // ── Sheet selection ────────────────────────────────────────────────────────
  if (step === "sheet" && pendingFile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-8">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <FileSpreadsheet className="w-10 h-10 text-blue-500 mx-auto mb-3" />
            <h1 className="text-2xl font-bold text-gray-900">Select sheet</h1>
            <p className="text-gray-500 mt-1 text-sm">
              {pendingFile.name} · choose the tab to analyse
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-2 mb-6 flex flex-col gap-1">
            {availableSheets.map(sheet => (
              <button
                key={sheet}
                onClick={() => setSelectedSheet(sheet)}
                className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  selectedSheet === sheet
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <FileSpreadsheet className={`w-4 h-4 flex-shrink-0 ${selectedSheet === sheet ? "text-blue-500" : "text-gray-400"}`} />
                <span className="truncate">{sheet}</span>
                {selectedSheet === sheet && (
                  <CheckCircle className="w-4 h-4 ml-auto flex-shrink-0 text-blue-500" />
                )}
              </button>
            ))}
          </div>

          <button
            onClick={() => setStep("year")}
            disabled={!selectedSheet}
            className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => setStep("drop")}
            className="w-full mt-3 py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // ── Year selection ─────────────────────────────────────────────────────────
  if (step === "year") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-8">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Select plan year</h1>
            <p className="text-gray-500 mt-1 text-sm">
              {pendingFile
                ? `${pendingFile.name}${selectedSheet ? ` · ${selectedSheet}` : ""}`
                : "Blank plan"} · choose the year this plan covers
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Plan year
            </label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {YEAR_OPTIONS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleYearConfirm}
            className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            {pendingFile ? "Analyse plan" : "Create blank plan"}
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => setStep(availableSheets.length > 1 ? "sheet" : "drop")}
            className="w-full mt-3 py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // ── Parsing ────────────────────────────────────────────────────────────────
  if (step === "parsing") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-gray-700 font-medium">Analysing your media plan…</p>
          <p className="text-sm text-gray-400">{parseProgress}</p>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-8">
        <div className="w-full max-w-2xl">
          {/* Header */}
          <div className="text-center mb-6">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Could not parse file</h2>
            <p className="text-sm text-gray-500">{errorMsg}</p>
          </div>

          {/* Tips card */}
          <div className="bg-white border border-amber-200 rounded-xl p-5 mb-5">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">Common fixes</p>
            <ul className="space-y-2.5">
              <li className="flex gap-2.5 text-sm text-gray-700">
                <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">1</span>
                <span><strong>W/C date columns are set correctly</strong> — each week column header must be a real date (e.g. <span className="font-mono bg-gray-100 px-1 rounded">5-Jan</span>, <span className="font-mono bg-gray-100 px-1 rounded">12-Jan</span>). Make sure the cells are formatted as <em>dates</em> in Excel, not plain text, and that all weekly columns are visible and not hidden.</span>
              </li>
              <li className="flex gap-2.5 text-sm text-gray-700">
                <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">2</span>
                <span><strong>All cells are clearly outlined</strong> — every data cell should have a visible border. Merged cells and cells without borders can cause rows to be skipped during parsing.</span>
              </li>
              <li className="flex gap-2.5 text-sm text-gray-700">
                <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">3</span>
                <span><strong>Select the correct sheet</strong> — if your file has multiple tabs, make sure you selected the one containing the media plan grid.</span>
              </li>
            </ul>
          </div>

          {/* Visual diagram */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Expected format</p>
            <SpreadsheetDiagram />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep("drop")}
              className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Review ─────────────────────────────────────────────────────────────────
  if (step === "review" && parsedPlan) {
    const total = totalBudget(parsedPlan.rows);
    const channelSet = new Set(parsedPlan.rows.map(r => r.channel || r.funnel).filter(Boolean));

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-8">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-6">
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-gray-900">Plan parsed successfully</h2>
            <p className="text-sm text-gray-500 mt-1">{parsedPlan.title}</p>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: "Channels", value: channelSet.size },
              { label: "Rows", value: parsedPlan.rows.length },
              { label: "Total budget", value: total > 0 ? formatBudget(total) : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <div className="text-xl font-bold text-gray-900">{value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Custom columns detected */}
          {parsedPlan.customColumns && parsedPlan.customColumns.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide flex-shrink-0">Custom columns detected:</span>
              {parsedPlan.customColumns.map(col => (
                <span key={col.id} className="text-xs bg-blue-100 text-blue-800 rounded px-2 py-0.5 font-medium">
                  {col.name}
                </span>
              ))}
            </div>
          )}

          {/* Row preview */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2 border-b border-gray-100 bg-gray-50">
              Detected rows
            </div>
            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {(() => {
                const promptedChannels = new Set<string>();
                return parsedPlan.rows.map(row => {
                  const ch = (row.channel || '').trim();
                  const isSuspect = suspectChannels.includes(ch);
                  const answered = organicOverrides[ch] !== undefined;
                  const showPrompt = isSuspect && !answered && !promptedChannels.has(ch);
                  if (showPrompt) promptedChannels.add(ch);
                  const effectiveIsOrganic = organicOverrides[ch] !== undefined ? organicOverrides[ch] : row.isOrganic;

                  return (
                    <React.Fragment key={row.id}>
                      <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
                        {row.funnel && (
                          <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 font-medium">
                            {row.funnel}
                          </span>
                        )}
                        <span className="font-medium text-gray-800 min-w-0 truncate">
                          {row.channel || "—"}
                        </span>
                        {effectiveIsOrganic && (
                          <span className="text-xs bg-purple-100 text-purple-700 rounded px-1.5 py-0.5 font-medium flex-shrink-0">
                            Organic
                          </span>
                        )}
                        {row.detail && (
                          <span className="text-gray-400 truncate">{row.detail}</span>
                        )}
                        <span className="ml-auto text-gray-500 flex-shrink-0">
                          {row.flights.length} flight{row.flights.length !== 1 ? "s" : ""}
                        </span>
                        {row.flights.length > 0 && (
                          <span className="text-gray-700 font-medium flex-shrink-0">
                            {formatBudget(row.flights.reduce((s, f) => s + f.budget, 0))}
                          </span>
                        )}
                      </div>
                      {showPrompt && (
                        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border-l-2 border-amber-400">
                          <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-xs text-amber-800 font-medium flex-1">
                            Potential organic channel detected — is <span className="font-semibold">{ch}</span> an unpaid posting row?
                          </span>
                          <button
                            onClick={() => setOrganicOverrides(prev => ({ ...prev, [ch]: true }))}
                            className="text-xs px-3 py-1 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 transition-colors flex-shrink-0"
                          >
                            Yes, organic
                          </button>
                          <button
                            onClick={() => setOrganicOverrides(prev => ({ ...prev, [ch]: false }))}
                            className="text-xs px-3 py-1 rounded-lg bg-white text-gray-600 font-medium border border-gray-200 hover:bg-gray-50 transition-colors flex-shrink-0"
                          >
                            No, it&apos;s paid
                          </button>
                        </div>
                      )}
                    </React.Fragment>
                  );
                });
              })()}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setParsedPlan(null); setSuspectChannels([]); setOrganicOverrides({}); setStep("drop"); }}
              className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Upload different file
            </button>
            <button
              onClick={() => {
                const finalPlan: SandboxPlan = {
                  ...parsedPlan,
                  rows: parsedPlan.rows.map(r => {
                    const ch = (r.channel || '').trim();
                    const override = organicOverrides[ch];
                    return { ...r, isOrganic: override !== undefined ? override : r.isOrganic };
                  }),
                };
                onPlanLoaded(finalPlan);
              }}
              className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              Load into builder
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
