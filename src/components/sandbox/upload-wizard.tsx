"use client";

import React, { useCallback, useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import type { SandboxPlan, PlanRow } from "./types";

type Step = "drop" | "parsing" | "review" | "error";

interface Props {
  onPlanLoaded: (plan: SandboxPlan) => void;
}

function formatBudget(n: number): string {
  return "$" + n.toLocaleString();
}

function totalBudget(rows: PlanRow[]): number {
  return rows.reduce((sum, r) => sum + r.flights.reduce((s, f) => s + f.budget, 0), 0);
}

export function UploadWizard({ onPlanLoaded }: Props) {
  const [step, setStep] = useState<Step>("drop");
  const [errorMsg, setErrorMsg] = useState("");
  const [parsedPlan, setParsedPlan] = useState<SandboxPlan | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [parseProgress, setParseProgress] = useState("");

  const parseFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx?|xls)$/i)) {
      setErrorMsg("Please upload an Excel file (.xlsx or .xls)");
      setStep("error");
      return;
    }

    setStep("parsing");
    setParseProgress("Reading file...");

    const formData = new FormData();
    formData.append("file", file);

    try {
      setParseProgress("Identifying columns and flights...");
      const res = await fetch("/api/sandbox/parse", { method: "POST", body: formData });
      const json = await res.json();

      if (!res.ok || json.error) {
        setErrorMsg(json.error ?? "Parse failed. Try again.");
        setStep("error");
        return;
      }

      setParsedPlan(json.plan);
      setStep("review");
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStep("error");
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = "";
  }, [parseFile]);

  // ── Drop zone ──────────────────────────────────────────────────────────────
  if (step === "drop") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-8">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Media Plan Sandbox</h1>
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
            onClick={() => {
              // Build an empty starter plan starting first Monday of 2026
              const monday = (() => {
                const d = new Date(2026, 0, 5); // 5 Jan 2026 is first Monday
                d.setHours(0, 0, 0, 0);
                return d;
              })();

              const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              const monthsFull = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
              const weeks = Array.from({ length: 13 }, (_, i) => {
                const d = new Date(monday);
                d.setDate(monday.getDate() + i * 7);
                const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                return {
                  weekStart: iso,
                  label: `${d.getDate()}-${months[d.getMonth()]}`,
                  month: monthsFull[d.getMonth()],
                  year: d.getFullYear(),
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
            }}
            className="w-full py-3 px-4 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            Start from scratch (blank plan)
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
        <div className="w-full max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Could not parse file</h2>
          <p className="text-sm text-gray-500 mb-6">{errorMsg}</p>
          <button
            onClick={() => setStep("drop")}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ── Review ─────────────────────────────────────────────────────────────────
  if (step === "review" && parsedPlan) {
    const total = totalBudget(parsedPlan.rows);
    const channelSet = new Set(parsedPlan.rows.map(r => r.channel || r.funnel).filter(Boolean));
    const flightCount = parsedPlan.rows.reduce((s, r) => s + r.flights.length, 0);

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-8">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-6">
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-gray-900">Plan parsed successfully</h2>
            <p className="text-sm text-gray-500 mt-1">{parsedPlan.title}</p>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: "Channels", value: channelSet.size },
              { label: "Rows", value: parsedPlan.rows.length },
              { label: "Flights", value: flightCount },
              { label: "Total budget", value: total > 0 ? formatBudget(total) : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <div className="text-xl font-bold text-gray-900">{value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Row preview */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2 border-b border-gray-100 bg-gray-50">
              Detected rows (first 8)
            </div>
            <div className="divide-y divide-gray-100">
              {parsedPlan.rows.slice(0, 8).map(row => (
                <div key={row.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  {row.funnel && (
                    <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 font-medium">
                      {row.funnel}
                    </span>
                  )}
                  <span className="font-medium text-gray-800 min-w-0 truncate">
                    {row.channel || "—"}
                  </span>
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
              ))}
              {parsedPlan.rows.length > 8 && (
                <div className="px-4 py-2 text-xs text-gray-400">
                  + {parsedPlan.rows.length - 8} more rows
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setParsedPlan(null); setStep("drop"); }}
              className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Upload different file
            </button>
            <button
              onClick={() => onPlanLoaded(parsedPlan)}
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
