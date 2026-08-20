import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Footer from '@/components/Footer';
import { ChannelPerformanceMockup, CPAGaugeMockup, MediaPlanMockup } from '@/components/features/FeatureMockups';
import {
  LayoutDashboard,
  Users,
  BarChart3,
  CheckCircle2,
  Calendar,
  Zap,
  Brain,
  FileText,
  Link2,
  BookOpen,
  TrendingUp,
  Bell,
  Target,
  Layers,
  PieChart,
  ArrowRight,
  Activity,
  Workflow,
  Gauge,
} from 'lucide-react';

const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };
const serifFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };

interface FeatureCardProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
}

function FeatureCard({ icon, iconBg, title, description }: FeatureCardProps) {
  return (
    <div
      className="p-6 rounded-[18px] transition-shadow"
      style={{
        background: '#FDFCF8',
        border: '1px solid rgba(232,228,220,0.7)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)',
      }}
    >
      <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style={{ background: iconBg }}>
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2" style={{ color: '#1C1917' }}>{title}</h3>
      <p className="text-sm leading-relaxed" style={{ color: '#8A8578' }}>{description}</p>
    </div>
  );
}

interface SectionProps {
  label: string;
  headline: string;
  description: string;
  children: React.ReactNode;
  alt?: boolean;
}

function Section({ label, headline, description, children, alt }: SectionProps) {
  return (
    <section className="py-20" style={{ background: alt ? '#F5F3EF' : '#FDFCF8' }}>
      <div className="container mx-auto px-4">
        <div className="text-center mb-12 max-w-2xl mx-auto">
          <span
            className="inline-block text-xs font-semibold uppercase tracking-widest mb-3 px-3 py-1 rounded-full"
            style={{ background: '#E8EDF2', color: '#4A6580' }}
          >
            {label}
          </span>
          <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#1C1917', ...serifFont }}>
            {headline}
          </h2>
          <p className="text-base" style={{ color: '#8A8578' }}>{description}</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {children}
        </div>
      </div>
    </section>
  );
}

export default function FeaturesPage() {
  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#F5F3EF', ...pageFont }}>
      <main className="flex-1">
        {/* Hero */}
        <section className="py-24 md:py-32" style={{ background: '#F5F3EF' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center space-y-6">
              <span
                className="inline-block text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
                style={{ background: '#E8EDF2', color: '#4A6580' }}
              >
                Platform Features
              </span>
              <h1 className="text-4xl md:text-6xl font-bold leading-tight" style={{ color: '#1C1917', ...serifFont, letterSpacing: '-0.02em' }}>
                Everything your agency needs in one place
              </h1>
              <p className="text-lg md:text-xl max-w-2xl mx-auto" style={{ color: '#8A8578' }}>
                PlanPulse gives marketing agencies a real-time command centre — from campaign health scoring
                and media planning to AI-powered briefings and cross-platform analytics.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <Link href="/auth/login">
                  <Button size="lg" className="text-base px-8 py-5 h-auto group">
                    Get started free
                    <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                <Link href="/pricing">
                  <Button size="lg" variant="outline" className="text-base px-8 py-5 h-auto">
                    View pricing
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Agency & Client Management */}
        <Section
          label="Agency Operations"
          headline="Full visibility across every client"
          description="Manage your entire book of business from a single dashboard. Know the health of every account at a glance without opening a single spreadsheet."
        >
          <FeatureCard
            icon={<LayoutDashboard className="w-6 h-6" style={{ color: '#4A6580' }} />}
            iconBg="#E8EDF2"
            title="Agency Dashboard"
            description="Centralised view of all clients with real-time health scores, overdue alerts, pacing issues, and upcoming launches — colour-coded for instant prioritisation."
          />
          <FeatureCard
            icon={<Users className="w-6 h-6" style={{ color: '#4A6580' }} />}
            iconBg="#E8EDF2"
            title="Client Management"
            description="Create client profiles with logos, notes, account manager assignments, and billing metadata. Filter the dashboard by account manager tabs."
          />
          <FeatureCard
            icon={<Gauge className="w-6 h-6" style={{ color: '#4A7C59' }} />}
            iconBg="#EAF0EB"
            title="Health Scoring"
            description="Dynamic health scores calculated from budget pacing (44%), action point completion (28%), and performance (28%) — with customisable weights per client."
          />
        </Section>

        {/* Media Planning */}
        <Section
          label="Media Planning"
          headline="Plan campaigns across every channel"
          description="Build, visualise, and manage media plans with channel-level budgets, flight dates, and Gantt timeline views — all in one place."
          alt
        >
          <FeatureCard
            icon={<Target className="w-6 h-6" style={{ color: '#4A6580' }} />}
            iconBg="#E8EDF2"
            title="Media Plan Builder"
            description="Create multi-channel media plans with budget allocation, flight scheduling, and channel libraries. Import plans directly from spreadsheets."
          />
          <FeatureCard
            icon={<Calendar className="w-6 h-6" style={{ color: '#4A6580' }} />}
            iconBg="#E8EDF2"
            title="Gantt Timeline View"
            description="Visualise all campaign flights on an interactive Gantt chart with zoom controls, action point markers, and sorting by start or end date."
          />
          <FeatureCard
            icon={<Layers className="w-6 h-6" style={{ color: '#4A7C59' }} />}
            iconBg="#EAF0EB"
            title="Multi-Channel Support"
            description="Plan across paid digital (Google, Meta, TikTok, LinkedIn), organic social, email, OOH, display, native, and traditional media channels."
          />
        </Section>

        {/* Media Plan visual showcase */}
        <section className="py-16" style={{ background: '#F5F3EF' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <p className="text-center text-xs font-semibold uppercase tracking-widest mb-6" style={{ color: '#8A8578' }}>
                Media plan · Gantt timeline view
              </p>
              <div style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)', borderRadius: 16, overflow: 'hidden' }}>
                <MediaPlanMockup />
              </div>
            </div>
          </div>
        </section>

        {/* Analytics & Performance */}
        <Section
          label="Analytics & Performance"
          headline="Real-time spend and performance tracking"
          description="Monitor actual vs. planned spend, pacing variance, and platform-native metrics — with automatic syncing from your connected ad accounts."
        >
          <FeatureCard
            icon={<BarChart3 className="w-6 h-6" style={{ color: '#4A6580' }} />}
            iconBg="#E8EDF2"
            title="Channel Performance Cards"
            description="Per-channel analytics with spend charts, CTR, CPC, conversion trends, and benchmark comparisons against industry averages."
          />
          <FeatureCard
            icon={<Activity className="w-6 h-6" style={{ color: '#4A6580' }} />}
            iconBg="#E8EDF2"
            title="Pacing Analysis"
            description="Track overspend and underspend in real time. Forecast end-of-period spend based on current pacing with visual alerts when campaigns drift off track."
          />
          <FeatureCard
            icon={<PieChart className="w-6 h-6" style={{ color: '#4A7C59' }} />}
            iconBg="#EAF0EB"
            title="Funnel Analysis"
            description="Build cross-platform conversion funnels with stage-by-stage metrics. Identify drop-off points and optimise conversion paths across channels."
          />
          <FeatureCard
            icon={<TrendingUp className="w-6 h-6" style={{ color: '#4A6580' }} />}
            iconBg="#E8EDF2"
            title="Period-over-Period Comparison"
            description="Compare current period performance against the previous period across all metrics and channels to spot trends and regressions."
          />
          <FeatureCard
            icon={<Bell className="w-6 h-6" style={{ color: '#4A6580' }} />}
            iconBg="#E8EDF2"
            title="Anomaly Detection"
            description="Automatic alerts when campaign performance deviates from expected ranges — so issues get caught before they become expensive problems."
          />
          <FeatureCard
            icon={<Link2 className="w-6 h-6" style={{ color: '#4A7C59' }} />}
            iconBg="#EAF0EB"
            title="Platform Integrations"
            description="Native connectors for Google Ads, Meta Ads, and GA4. Spend data syncs automatically so your dashboards always reflect live numbers."
          />
        </Section>

        {/* Analytics visual showcase */}
        <section className="py-16" style={{ background: '#FDFCF8' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto space-y-6">
              <p className="text-center text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#8A8578' }}>
                Channel performance · spend tracking · CPA monitoring
              </p>
              <div style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)', borderRadius: 16, overflow: 'hidden' }}>
                <ChannelPerformanceMockup />
              </div>
              <div className="grid sm:grid-cols-2 gap-6">
                <div style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08)', borderRadius: 16, overflow: 'hidden' }}>
                  <CPAGaugeMockup overTarget={false} />
                </div>
                <div style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08)', borderRadius: 16, overflow: 'hidden' }}>
                  <CPAGaugeMockup overTarget={true} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Task Management */}
        <Section
          label="Task Management"
          headline="Never miss a setup step or health check"
          description="Action points auto-generate from your media plan so every channel launch and recurring review is tracked without manual effort."
          alt
        >
          <FeatureCard
            icon={<CheckCircle2 className="w-6 h-6" style={{ color: '#4A7C59' }} />}
            iconBg="#EAF0EB"
            title="Action Points"
            description="Two action types — SET UP (pre-launch tasks) and HEALTH CHECK (recurring reviews) — each with due dates calculated automatically from campaign dates."
          />
          <FeatureCard
            icon={<Workflow className="w-6 h-6" style={{ color: '#4A6580' }} />}
            iconBg="#E8EDF2"
            title="Kanban, List & Timeline Views"
            description="Switch between Kanban board, flat list, and Gantt timeline views. Tasks surface across all three views so nothing slips through the cracks."
          />
          <FeatureCard
            icon={<Users className="w-6 h-6" style={{ color: '#4A6580' }} />}
            iconBg="#E8EDF2"
            title="Team Assignment"
            description="Assign action points to team members and track completion status. Overdue items are flagged automatically in the agency briefing."
          />
        </Section>

        {/* AI & Reporting */}
        <Section
          label="AI & Reporting"
          headline="Intelligent insights, automated briefings"
          description="From daily AI briefings delivered to your inbox or Teams channel, to an on-demand chat agent that can take action — PlanPulse keeps your team informed."
        >
          <FeatureCard
            icon={<Brain className="w-6 h-6" style={{ color: '#4A6580' }} />}
            iconBg="#E8EDF2"
            title="AI Chat Agent"
            description="Ask questions, request analysis, and trigger actions directly in plain English. The agent has full context on your clients, campaigns, and performance data."
          />
          <FeatureCard
            icon={<Zap className="w-6 h-6" style={{ color: '#4A7C59' }} />}
            iconBg="#EAF0EB"
            title="Daily AI Briefing"
            description="Automated daily summaries delivered to Microsoft Teams or email — covering overdue tasks, pacing alerts, anomalies, and upcoming launches for every client."
          />
          <FeatureCard
            icon={<FileText className="w-6 h-6" style={{ color: '#4A6580' }} />}
            iconBg="#E8EDF2"
            title="PDF Report Export"
            description="Generate polished client-ready PDF reports with selected metrics, date ranges, and your agency branding. White-label options available on Agency plan."
          />
          <FeatureCard
            icon={<BookOpen className="w-6 h-6" style={{ color: '#4A6580' }} />}
            iconBg="#E8EDF2"
            title="Client Intelligence Hub"
            description="Store client briefs, goals, competitive insights, and audience research alongside campaign data so your whole team stays aligned on strategy."
          />
          <FeatureCard
            icon={<FileText className="w-6 h-6" style={{ color: '#4A7C59' }} />}
            iconBg="#EAF0EB"
            title="Invoice Generator"
            description="Create and track client invoices with commission rates and historical records — without leaving the platform."
          />
          <FeatureCard
            icon={<BookOpen className="w-6 h-6" style={{ color: '#4A6580' }} />}
            iconBg="#E8EDF2"
            title="Playbook & Channel Library"
            description="Maintain a central library of SOPs, brand guidelines, channel specs, and onboarding docs. Searchable and categorised for the whole team."
          />
        </Section>

        {/* CTA */}
        <section className="py-24" style={{ background: '#1C1917' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center space-y-6">
              <h2 className="text-3xl md:text-4xl font-bold" style={{ color: '#F5F3EF', ...serifFont }}>
                Ready to take control of your agency?
              </h2>
              <p className="text-base" style={{ color: '#A8A39A' }}>
                Start for free and upgrade as your client roster grows.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
                <Link href="/auth/login">
                  <Button size="lg" className="text-base px-8 py-5 h-auto group bg-white text-stone-900 hover:bg-stone-100">
                    Get started free
                    <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                <Link href="/pricing">
                  <Button size="lg" variant="outline" className="text-base px-8 py-5 h-auto border-stone-600 text-stone-300 hover:bg-stone-800 hover:text-white">
                    View pricing
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
