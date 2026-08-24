"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, Paperclip, ArrowUp, Loader2, X } from "lucide-react";
import type { SandboxPlan } from "./types";
import { mergeExtractionIntoPlan } from "@/lib/media-plan/sandbox-sync";
import type { VisionExtraction } from "@/app/api/media-plan-agent/vision-extract/route";
import { ExtractionCard } from "./extraction-card";
import { BetaSignupForm } from "./beta-signup-form";

const INK = '#1C1917';
const GRAPHITE = '#5C5450';
const MUTED = '#8A8578';
const BORDER = 'oklch(89% 0.011 75)';
const CARD_BG = 'oklch(98% 0.006 75)';
const PAPER_BG = 'oklch(96% 0.009 75)';
const RED = 'oklch(42% 0.16 25)';
const sansFont = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";

const DAILY_LIMIT = 5;

function todayKey(): string {
  return `media_plan_builder_ai_uses_${new Date().toISOString().slice(0, 10)}`;
}

function getUsesToday(): number {
  try {
    return Number(localStorage.getItem(todayKey()) ?? "0") || 0;
  } catch {
    return 0;
  }
}

function incrementUsesToday(): number {
  const next = getUsesToday() + 1;
  try { localStorage.setItem(todayKey(), String(next)); } catch { /* ignore */ }
  return next;
}

interface AttachedImage {
  base64: string;
  mimeType: string;
  preview: string;
  name: string;
}

interface Props {
  currentPlan: SandboxPlan | null;
  onPlanApplied: (plan: SandboxPlan) => void;
  autoAttachImage?: AttachedImage | null;
  onAutoAttachConsumed?: () => void;
  onClose: () => void;
}

/** Self-contained AI panel for the public /media-plan-builder tool: upload a
 *  screenshot, get an extracted plan, chat corrections to fix it up. Unlike
 *  MediaPlanChatPanel (dashboard-v2), this has no clientId/agent dependency —
 *  it only calls the two stateless vision-extract/revise endpoints, which is
 *  what makes it safe to expose to anonymous visitors. */
export function PublicAiPanel({ currentPlan, onPlanApplied, autoAttachImage, onAutoAttachConsumed, onClose }: Props) {
  const [extracting, setExtracting] = useState(false);
  const [revising, setRevising] = useState(false);
  const [pendingExtraction, setPendingExtraction] = useState<VisionExtraction | null>(null);
  const [applied, setApplied] = useState(false);
  const [correction, setCorrection] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [usesToday, setUsesToday] = useState(0);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const autoRanRef = useRef(false);

  useEffect(() => { setUsesToday(getUsesToday()); }, []);

  const runExtraction = useCallback(async (image: AttachedImage) => {
    setExtracting(true);
    setErrorMsg(null);
    setRateLimited(false);
    try {
      const year = currentPlan?.weeks?.[0]?.year;
      const res = await fetch('/api/media-plan-agent/vision-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: image.base64, mimeType: image.mimeType, year }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setRateLimited(true);
        setErrorMsg(json.error ?? "You've used today's free AI actions.");
        return;
      }
      if (!res.ok) throw new Error(json.error ?? 'Could not read that screenshot');
      setPendingExtraction({
        channels: json.channels ?? [],
        fees: json.fees ?? [],
        customColumns: json.customColumns ?? [],
        notes: json.notes ?? [],
      });
      setApplied(false);
      setUsesToday(incrementUsesToday());
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not read that screenshot');
    } finally {
      setExtracting(false);
    }
  }, [currentPlan]);

  // Auto-run once if a screenshot was handed off from the upload wizard's
  // "Upload a screenshot of your Media Plan" entry point.
  useEffect(() => {
    if (autoAttachImage && !autoRanRef.current) {
      autoRanRef.current = true;
      runExtraction(autoAttachImage);
      onAutoAttachConsumed?.();
    }
  }, [autoAttachImage, runExtraction, onAutoAttachConsumed]);

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      runExtraction({ base64: dataUrl.split(",")[1], mimeType: file.type, preview: dataUrl, name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const handleRevise = async () => {
    if (!pendingExtraction || !correction.trim() || revising) return;
    setRevising(true);
    setErrorMsg(null);
    setRateLimited(false);
    try {
      const res = await fetch('/api/media-plan-agent/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current: pendingExtraction, correction }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setRateLimited(true);
        setErrorMsg(json.error ?? "You've used today's free AI actions.");
        return;
      }
      if (!res.ok) throw new Error(json.error ?? 'Could not apply that correction');
      setPendingExtraction({
        channels: json.channels ?? [],
        fees: json.fees ?? [],
        customColumns: json.customColumns ?? [],
        notes: json.notes ?? [],
      });
      setCorrection("");
      setUsesToday(incrementUsesToday());
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not apply that correction');
    } finally {
      setRevising(false);
    }
  };

  const handleApply = () => {
    if (!pendingExtraction) return;
    const merged = mergeExtractionIntoPlan(currentPlan, pendingExtraction);
    onPlanApplied(merged);
    setApplied(true);
  };

  const remaining = Math.max(0, DAILY_LIMIT - usesToday);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12,
      fontFamily: sansFont, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={14} style={{ color: RED }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>AI Plan Assistant</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ fontSize: 12.5, color: GRAPHITE, lineHeight: 1.5 }}>
          Upload a screenshot of an existing media plan and the AI will read it into the
          grid — then tell it what to fix.
        </p>

        <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={handleFileSelected} />
        <button
          onClick={() => imageInputRef.current?.click()}
          disabled={extracting || rateLimited}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '8px 12px', borderRadius: 10, border: `1px dashed ${BORDER}`,
            background: PAPER_BG, color: GRAPHITE, fontSize: 12.5, fontWeight: 500,
            cursor: extracting || rateLimited ? 'not-allowed' : 'pointer', opacity: extracting || rateLimited ? 0.6 : 1,
          }}
        >
          {extracting ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
          {extracting ? 'Reading screenshot…' : 'Upload a screenshot'}
        </button>

        {errorMsg && (
          <div style={{ fontSize: 12, color: RED, background: 'oklch(96% 0.03 25)', border: `1px solid oklch(88% 0.06 25)`, borderRadius: 8, padding: '8px 10px' }}>
            {errorMsg}
          </div>
        )}

        {pendingExtraction && (
          <ExtractionCard
            extraction={pendingExtraction}
            applied={applied}
            onApply={handleApply}
            onDismiss={() => setPendingExtraction(null)}
          />
        )}

        {rateLimited && (
          <BetaSignupForm
            heading="Out of free AI actions for today"
            description="Sign up for the free beta to get unlimited AI plan extraction and corrections."
          />
        )}

        {!rateLimited && (
          <p style={{ fontSize: 11, color: MUTED, marginTop: 'auto' }}>
            {remaining} of {DAILY_LIMIT} free AI actions left today
          </p>
        )}
      </div>

      {pendingExtraction && !rateLimited && (
        <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: `1px solid ${BORDER}` }}>
          <input
            value={correction}
            onChange={e => setCorrection(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleRevise(); }}
            placeholder="e.g. the Meta budget should be $5,000"
            disabled={revising}
            style={{
              flex: 1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 10px',
              fontSize: 12.5, outline: 'none', fontFamily: sansFont, background: CARD_BG,
            }}
          />
          <button
            onClick={handleRevise}
            disabled={revising || !correction.trim()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 8, border: 'none',
              background: INK, color: CARD_BG, cursor: revising || !correction.trim() ? 'not-allowed' : 'pointer',
              opacity: revising || !correction.trim() ? 0.5 : 1, flexShrink: 0,
            }}
          >
            {revising ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
          </button>
        </div>
      )}
    </div>
  );
}
