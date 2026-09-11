'use client';

import { useState, type ComponentType } from 'react';
import {
  ReceiptText,
  CalendarRange,
  BarChart2,
  Bot,
  type LucideIcon,
} from 'lucide-react';
import HealthCheckAgentDemo from '@/components/features/HealthCheckAgentDemo';
import InvoiceAgentDemo from '@/components/features/InvoiceAgentDemo';
import MediaPlanEditorDemo from '@/components/features/MediaPlanEditorDemo';
import PerformanceAnalystDemo from '@/components/features/PerformanceAnalystDemo';

const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };

// Matches the maroon used for agent icons across the app (AgencyChat.tsx, agents/page.tsx, AgentsSummaryCard.tsx)
const AGENT_ICON_COLOR = '#7B1F2C';

type ShowcaseAgent = {
  slug: string;
  name: string;
  icon: LucideIcon;
  tagline: string;
  Mockup: ComponentType;
};

const SHOWCASE_AGENTS: ShowcaseAgent[] = [
  {
    slug: 'setup_auditor',
    name: 'Health Check Agent',
    icon: Bot,
    tagline: 'Audits live Google and Meta campaigns against their intended setup and flags every discrepancy.',
    Mockup: HealthCheckAgentDemo,
  },
  {
    slug: 'invoice_generator',
    name: 'Invoice Generator',
    icon: ReceiptText,
    tagline: 'Builds accurate client invoices from planned or actual spend, with commission breakdowns, in seconds.',
    Mockup: InvoiceAgentDemo,
  },
  {
    slug: 'media_plan_editor',
    name: 'Media Planning Agent',
    icon: CalendarRange,
    tagline: 'Builds and adjusts media plans conversationally — just describe the flight, budget, or dates.',
    Mockup: MediaPlanEditorDemo,
  },
  {
    slug: 'performance_analyst',
    name: 'Performance Analyst',
    icon: BarChart2,
    tagline: 'Surfaces pacing, variance, and cross-channel performance insights the moment you ask.',
    Mockup: PerformanceAnalystDemo,
  },
];

const DEFAULT_ACTIVE_SLUG = 'setup_auditor';

export default function AgentShowcase() {
  const [active, setActive] = useState(
    Math.max(0, SHOWCASE_AGENTS.findIndex((a) => a.slug === DEFAULT_ACTIVE_SLUG))
  );

  const activeAgent = SHOWCASE_AGENTS[active];
  const MockupComp = activeAgent.Mockup;

  return (
    <section className="py-20" style={{ background: '#F5F3EF' }}>
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2
            className="text-3xl md:text-4xl font-bold mb-3"
            style={{ color: '#1C1917', ...pageFont }}
          >
            Meet your team of AI agent employees
          </h2>
          <p className="text-base max-w-xl mx-auto" style={{ color: '#8A8578' }}>
            Purpose-built agents that handle the busywork — invoices, media plans, audits, and performance reviews — so you don&apos;t have to.
          </p>
        </div>

        <div className="max-w-5xl mx-auto grid lg:grid-cols-[280px_1fr] gap-10 lg:gap-16 items-start">
          {/* Agent column — all agents always in view, click to select */}
          <div className="flex flex-col gap-2 mx-auto lg:mx-0 w-full" style={{ maxWidth: 320 }}>
            {SHOWCASE_AGENTS.map((agent, i) => {
              const Icon = agent.icon;
              const isActive = i === active;
              return (
                <button
                  key={agent.slug}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Show ${agent.name}`}
                  aria-current={isActive}
                  className="flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors duration-300"
                  style={{
                    background: isActive ? '#FDFCF8' : 'transparent',
                    border: isActive ? '1px solid rgba(123,31,44,0.18)' : '1px solid transparent',
                    boxShadow: isActive ? '0 8px 30px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    className="flex items-center justify-center rounded-xl flex-shrink-0"
                    style={{ width: 40, height: 40, background: 'rgba(123,31,44,0.08)' }}
                  >
                    <Icon className="w-5 h-5" style={{ color: AGENT_ICON_COLOR }} />
                  </span>
                  <span className="text-sm font-semibold" style={{ color: '#1C1917', ...pageFont }}>
                    {agent.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Corresponding visual — these three agents need extra width since their chat
              thread sits alongside a live chart/grid/screenshot rather than replacing it */}
          <div className="mx-auto lg:mx-0" style={{ maxWidth: ['setup_auditor', 'media_plan_editor', 'performance_analyst'].includes(activeAgent.slug) ? 640 : 460 }}>
            <p
              key={`${activeAgent.slug}-tag`}
              className="mb-4 text-sm text-center lg:text-left animate-in fade-in-0 duration-500"
              style={{ color: '#8A8578' }}
            >
              {activeAgent.tagline}
            </p>
            <div
              key={activeAgent.slug}
              className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500"
              style={{
                boxShadow: '0 8px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
                borderRadius: 16,
                overflow: 'hidden',
              }}
            >
              <MockupComp />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
