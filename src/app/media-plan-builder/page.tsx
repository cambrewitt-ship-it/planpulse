"use client";

import { useEffect, useState } from "react";
import { CalendarRange, Sparkles, FileDown, ChevronLeft, ChevronRight, CheckCircle } from "lucide-react";
import { UploadWizard } from "@/components/sandbox/upload-wizard";
import { PlanGrid } from "@/components/sandbox/plan-grid";
import { PublicAiPanel } from "@/components/sandbox/public-ai-panel";
import { SignupForm } from "@/components/auth/signup-form";
import Footer from "@/components/Footer";
import type { SandboxPlan } from "@/components/sandbox/types";
import { createBlankSandboxPlan } from "@/lib/media-plan/sandbox-sync";

const STORAGE_KEY = "planpulse_sandbox_plan";

const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };

// Bounds the builder to a card within the page — mirrors how the Media Plan
// tab is sized inside the client dashboard (src/app/clients/[id]/dashboard/page.tsx),
// just without that page's tab bar eating into the height budget.
const BUILDER_HEIGHT = "clamp(480px, 75vh, 760px)";

interface Bullet {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const BETA_PERKS: string[] = [
  "Save and revisit media plans across every client, synced to your account",
  "AI-powered plan extraction from screenshots and messy Excel files",
  "Client dashboards with live health scores, funnels, and reporting",
  "A direct line to us — your feedback shapes what we build next",
];

const BULLETS: Bullet[] = [
  {
    icon: <CalendarRange className="w-5 h-5" />,
    title: "Visual weekly timeline",
    description: "Drag to schedule flights across channels, set budgets, and see totals roll up by month.",
  },
  {
    icon: <Sparkles className="w-5 h-5" />,
    title: "AI screenshot import",
    description: "Upload a screenshot of an existing plan and the AI reads it straight into the grid.",
  },
  {
    icon: <FileDown className="w-5 h-5" />,
    title: "Downloadable PDF",
    description: "Export a clean, branded summary you can send to a client or teammate.",
  },
];

function Hero() {
  return (
    <section className="py-16 md:py-20" style={{ background: '#F5F3EF' }}>
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold leading-tight" style={{ color: '#1C1917' }}>
            Free Media Plan Builder
          </h1>
          <p className="text-base md:text-lg" style={{ color: '#5C5650' }}>
            Plan, budget, and visualise your media schedule on a drag-and-drop weekly
            timeline. Upload an existing plan or start from scratch — no account needed.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto mt-10">
          {BULLETS.map(b => (
            <div
              key={b.title}
              className="p-5 rounded-[16px] text-center"
              style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)' }}
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 mx-auto" style={{ background: '#EFEAE0', color: '#4A7C59' }}>
                {b.icon}
              </div>
              <h3 className="text-sm font-semibold mb-1" style={{ color: '#1C1917' }}>{b.title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: '#8A8578' }}>{b.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function MediaPlanBuilderPage() {
  // "hydrated" only spans the gap before the mount effect below runs (matches
  // the server-rendered output, since localStorage isn't available server-side)
  // — the builder card shows a skeleton during that gap so it never flashes the
  // upload wizard before flipping straight to a blank/saved plan.
  const [hydrated, setHydrated] = useState(false);
  const [plan, setPlan] = useState<SandboxPlan | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [pendingAiScreenshot, setPendingAiScreenshot] = useState<{ base64: string; mimeType: string; preview: string; name: string } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setPlan(raw ? JSON.parse(raw) : createBlankSandboxPlan());
    } catch {
      setPlan(createBlankSandboxPlan());
    }
    setHydrated(true);
  }, []);

  // Persist to localStorage on change
  const handlePlanChange = (updated: SandboxPlan) => {
    setPlan(updated);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch { /* quota */ }
  };

  const handlePlanLoaded = (loaded: SandboxPlan) => {
    handlePlanChange(loaded);
  };

  const handleUpload = () => {
    setPlan(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  };

  // "Upload a screenshot of your Media Plan" on the upload wizard — starts a
  // blank plan so the grid + AI panel mount, then hands the image to the panel
  // to auto-run the vision extraction. Mirrors handleScreenshotSelectedFromWizard
  // in the authenticated dashboard (src/app/clients/[id]/dashboard/page.tsx).
  const handleScreenshotSelected = (image: { base64: string; mimeType: string; preview: string; name: string }) => {
    handlePlanLoaded(createBlankSandboxPlan());
    setPendingAiScreenshot(image);
    setAiPanelOpen(true);
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#F5F3EF', ...pageFont }}>
      <Hero />

      <section className="pb-16" style={{ background: '#F5F3EF' }}>
        <div className="container mx-auto px-4">
          <div style={{ height: BUILDER_HEIGHT, display: 'flex' }}>
            {!hydrated ? (
              <div className="w-full h-full animate-pulse bg-gray-100 rounded-xl" />
            ) : plan ? (
              <>
                {/* AI panel sits on the left, same as the Media Plan tab in the
                    client dashboard (src/app/clients/[id]/dashboard/page.tsx) */}
                <div style={{
                  flex: '0 0 32%', minWidth: 280, maxWidth: 420, marginRight: 12,
                  display: aiPanelOpen ? 'flex' : 'none', flexDirection: 'column',
                }}>
                  <PublicAiPanel
                    currentPlan={plan}
                    onPlanApplied={handlePlanChange}
                    autoAttachImage={pendingAiScreenshot}
                    onAutoAttachConsumed={() => setPendingAiScreenshot(null)}
                    onClose={() => setAiPanelOpen(false)}
                  />
                </div>

                <div style={{ flexShrink: 0, marginRight: 12, display: 'flex', alignItems: 'center' }}>
                  <button
                    onClick={() => setAiPanelOpen(v => !v)}
                    title={aiPanelOpen ? 'Collapse AI Assistant' : 'Open AI Assistant'}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      width: aiPanelOpen ? 20 : 'auto',
                      height: 48, padding: aiPanelOpen ? 0 : '0 14px',
                      borderRadius: 8, whiteSpace: 'nowrap',
                      border: '0.5px solid #D5D0C5', background: '#FDFCF8',
                      color: '#1C1917', cursor: 'pointer',
                      fontSize: 13, fontWeight: 500, fontFamily: "'DM Sans', system-ui, sans-serif",
                      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    }}
                  >
                    {aiPanelOpen ? (
                      <ChevronLeft className="w-4 h-4" />
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        AI Assistant
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>

                <div style={{
                  flex: '1 1 auto', minWidth: 0, borderRadius: 12,
                  border: '1px solid rgba(232,228,220,0.7)',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)',
                  overflow: 'hidden', background: '#fff',
                }}>
                  <PlanGrid
                    plan={plan}
                    onPlanChange={handlePlanChange}
                    onUpload={handleUpload}
                    outerStyle={{ height: '100%' }}
                  />
                </div>
              </>
            ) : (
              <div style={{
                flex: '1 1 auto', minWidth: 0, borderRadius: 12,
                border: '1px solid rgba(232,228,220,0.7)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)',
                overflow: 'auto', background: '#fff',
              }}>
                <UploadWizard
                  onPlanLoaded={handlePlanLoaded}
                  onScreenshotSelected={handleScreenshotSelected}
                  title="Get started"
                  description="Upload an existing Excel plan, drop in a screenshot, or start from scratch"
                />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24" style={{ background: '#F5F3EF' }}>
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center max-w-5xl mx-auto">
            {/* Left: marketing copy aimed at agency planners */}
            <div className="space-y-5">
              <span className="inline-block text-xs font-semibold tracking-wide uppercase px-3 py-1 rounded-full" style={{ background: '#EFEAE0', color: '#4A7C59' }}>
                Free public beta
              </span>
              <h2 className="text-2xl md:text-3xl font-bold leading-tight" style={{ color: '#1C1917' }}>
                Built for media &amp; marketing agencies
              </h2>
              <p className="text-base" style={{ color: '#5C5650' }}>
                We&apos;re opening PlanPulse up to a small group of agency planners to put the
                full toolkit through its paces — media plan builder, client dashboards, AI
                reporting — before public launch. Sign up free and help shape what we build next.
              </p>
              <ul className="space-y-3">
                {BETA_PERKS.map(perk => (
                  <li key={perk} className="flex items-start gap-2.5 text-sm" style={{ color: '#5C5650' }}>
                    <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#4A7C59' }} />
                    {perk}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right: signup form */}
            <div className="rounded-2xl p-6" style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)' }}>
              <h3 className="text-lg font-semibold mb-1" style={{ color: '#1C1917' }}>Create your free account</h3>
              <p className="text-sm mb-5" style={{ color: '#8A8578' }}>
                Takes less than a minute — no credit card required.
              </p>
              <SignupForm redirectTo="/agency" />
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
