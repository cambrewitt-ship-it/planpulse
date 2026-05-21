"use client";

import { useEffect, useState } from "react";
import { UploadWizard } from "@/components/sandbox/upload-wizard";
import { PlanGrid } from "@/components/sandbox/plan-grid";
import type { SandboxPlan } from "@/components/sandbox/types";

const STORAGE_KEY = "planpulse_sandbox_plan";

export default function SandboxPage() {
  const [plan, setPlan] = useState<SandboxPlan | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage after hydration
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPlan(JSON.parse(raw));
    } catch {
      // ignore
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

  if (!hydrated) return null;

  if (!plan) {
    return <UploadWizard onPlanLoaded={handlePlanLoaded} />;
  }

  return (
    <PlanGrid
      plan={plan}
      onPlanChange={handlePlanChange}
      onUpload={handleUpload}
    />
  );
}
