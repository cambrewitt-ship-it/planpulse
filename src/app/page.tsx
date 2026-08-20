'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import Footer from '@/components/Footer';
import { supabase } from '@/lib/supabase/client';
import {
  Target,
  Users,
  CheckCircle2,
  Zap,
  Brain,
  Link2,
  Gauge,
  Bell,
  ArrowRight,
} from 'lucide-react';
import {
  ChannelPerformanceMockup,
  CPAGaugeMockup,
  MediaPlanMockup,
} from '@/components/features/FeatureMockups';

const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };

function FeatureChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm" style={{ color: '#5C5650' }}>
      <span style={{ color: '#4A7C59' }}>{icon}</span>
      {label}
    </div>
  );
}

function FeatureCard({
  icon,
  iconBg,
  title,
  description,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
}) {
  return (
    <div
      className="p-6 rounded-[18px]"
      style={{
        background: '#FDFCF8',
        border: '1px solid rgba(232,228,220,0.7)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)',
      }}
    >
      <div className="w-11 h-11 rounded-lg flex items-center justify-center mb-4" style={{ background: iconBg }}>
        {icon}
      </div>
      <h3 className="text-base font-semibold mb-1" style={{ color: '#1C1917' }}>{title}</h3>
      <p className="text-sm leading-relaxed" style={{ color: '#8A8578' }}>{description}</p>
    </div>
  );
}

export default function Home() {
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsSignedIn(!!session?.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  const ctaHref = isSignedIn ? '/agency' : '/auth/signup';

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#F5F3EF', ...pageFont }}>
      <main className="flex-1">

        {/* ── Hero ── */}
        <section className="py-24 md:py-32" style={{ background: '#F5F3EF' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center space-y-6">
              <h1
                className="text-center font-bold leading-tight"
                style={{
                  color: '#1C1917',
                  ...pageFont,
                  letterSpacing: '-0.02em',
                  fontSize: 'clamp(1.25rem, 6.2vw, 3.5rem)',
                }}
              >
                <span className="block whitespace-nowrap">Health checking software</span>
                <span className="block whitespace-nowrap">for marketing agencies</span>
              </h1>
              <span
                className="inline-block text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
                style={{ background: '#EAF0EB', color: '#4A7C59' }}
              >
                Powered by Agentic AI
              </span>
              <p className="text-lg max-w-xl mx-auto" style={{ color: '#8A8578' }}>
                One platform to plan campaigns, track performance, manage action points, and brief your team — across every client and every channel.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Link href={ctaHref}>
                  <Button size="lg" className="text-base px-8 py-5 h-auto group">
                    Get started free
                    <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                <Link href="/features">
                  <Button
                    size="lg"
                    variant="outline"
                    className="text-base px-8 py-5 h-auto bg-white text-stone-900 border-white hover:bg-white/90 hover:text-stone-900"
                  >
                    Explore features
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── Media Plan showcase ── */}
        <section className="py-20" style={{ background: '#FDFCF8' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <span
                  className="inline-block text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
                  style={{ background: '#E8EDF2', color: '#4A6580' }}
                >
                  Media Planning
                </span>
                <h2
                  className="text-3xl md:text-4xl font-bold leading-tight"
                  style={{ color: '#1C1917', ...pageFont }}
                >
                  Plan every campaign,<br />every channel
                </h2>
                <p className="text-base leading-relaxed" style={{ color: '#8A8578' }}>
                  Build multi-channel media plans with weekly budgets, flight dates, and Gantt timelines. Import from a spreadsheet or build from scratch — then watch actuals sync in automatically.
                </p>
                <div className="space-y-3 pt-2">
                  <FeatureChip icon={<CheckCircle2 className="w-4 h-4" />} label="Paid digital, OOH, radio, email, and more" />
                  <FeatureChip icon={<CheckCircle2 className="w-4 h-4" />} label="Interactive Gantt view with zoom controls" />
                  <FeatureChip icon={<CheckCircle2 className="w-4 h-4" />} label="Budget allocation tracked week by week" />
                  <FeatureChip icon={<CheckCircle2 className="w-4 h-4" />} label="Upload a new plan version any time" />
                </div>
              </div>
              <div style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)', borderRadius: 16, overflow: 'hidden' }}>
                <MediaPlanMockup />
              </div>
            </div>
          </div>
        </section>

        {/* ── Channel Performance showcase ── */}
        <section className="py-20" style={{ background: '#F5F3EF' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
              <div className="order-2 lg:order-1" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)', borderRadius: 16, overflow: 'hidden' }}>
                <ChannelPerformanceMockup />
              </div>
              <div className="order-1 lg:order-2 space-y-6">
                <span
                  className="inline-block text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
                  style={{ background: '#E8EDF2', color: '#4A6580' }}
                >
                  Analytics & Performance
                </span>
                <h2
                  className="text-3xl md:text-4xl font-bold leading-tight"
                  style={{ color: '#1C1917', ...pageFont }}
                >
                  Real-time performance,<br />always visible
                </h2>
                <p className="text-base leading-relaxed" style={{ color: '#8A8578' }}>
                  See pacing, spend variance, and platform-native metrics in one place. Know instantly which campaigns are overspending, underperforming, or on track — before your client asks.
                </p>
                <div className="space-y-3 pt-2">
                  <FeatureChip icon={<CheckCircle2 className="w-4 h-4" />} label="Live spend vs. planned with overspend alerts" />
                  <FeatureChip icon={<CheckCircle2 className="w-4 h-4" />} label="CTR, CPC, CPA with benchmark comparisons" />
                  <FeatureChip icon={<CheckCircle2 className="w-4 h-4" />} label="Google Ads, Meta Ads & GA4 sync" />
                  <FeatureChip icon={<CheckCircle2 className="w-4 h-4" />} label="Period-over-period comparison built in" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── CPA gauge showcase ── */}
        <section className="py-20" style={{ background: '#FDFCF8' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <span
                  className="inline-block text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
                  style={{ background: '#EAF0EB', color: '#4A7C59' }}
                >
                  Anomaly Detection
                </span>
                <h2
                  className="text-3xl md:text-4xl font-bold leading-tight"
                  style={{ color: '#1C1917', ...pageFont }}
                >
                  Catch problems<br />before they cost you
                </h2>
                <p className="text-base leading-relaxed" style={{ color: '#8A8578' }}>
                  7-day rolling CPA charts with target thresholds show you the moment a metric crosses into dangerous territory. The gauge turns red — you act before it becomes a budget blowout.
                </p>
                <div className="space-y-3 pt-2">
                  <FeatureChip icon={<CheckCircle2 className="w-4 h-4" />} label="Rolling CPA, ROAS, and CPC trend monitoring" />
                  <FeatureChip icon={<CheckCircle2 className="w-4 h-4" />} label="Red/green gauge shows target vs. actual" />
                  <FeatureChip icon={<CheckCircle2 className="w-4 h-4" />} label="24H change indicator for rapid shifts" />
                  <FeatureChip icon={<CheckCircle2 className="w-4 h-4" />} label="Alerts surfaced in AI daily briefing" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
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

        {/* ── Top features grid ── */}
        <section className="py-20" style={{ background: '#F5F3EF' }}>
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2
                className="text-3xl md:text-4xl font-bold mb-3"
                style={{ color: '#1C1917', ...pageFont }}
              >
                Everything else you need
              </h2>
              <p className="text-base max-w-xl mx-auto" style={{ color: '#8A8578' }}>
                Built end-to-end for marketing agencies — from campaign setup to client reporting.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
              <FeatureCard
                icon={<Gauge className="w-5 h-5" style={{ color: '#4A7C59' }} />}
                iconBg="#EAF0EB"
                title="Health Scoring"
                description="Dynamic scores across pacing, action completion, and performance — customisable weights per client."
              />
              <FeatureCard
                icon={<CheckCircle2 className="w-5 h-5" style={{ color: '#4A6580' }} />}
                iconBg="#E8EDF2"
                title="Action Points"
                description="SET UP and HEALTH CHECK tasks auto-generated from your media plan with recurring due dates."
              />
              <FeatureCard
                icon={<Brain className="w-5 h-5" style={{ color: '#4A6580' }} />}
                iconBg="#E8EDF2"
                title="AI Chat Agent"
                description="Ask questions and get campaign insights in plain English — with full context on every client."
              />
              <FeatureCard
                icon={<Zap className="w-5 h-5" style={{ color: '#4A7C59' }} />}
                iconBg="#EAF0EB"
                title="Daily AI Briefing"
                description="Automated summaries to Teams or email covering overdue tasks, pacing alerts, and upcoming launches."
              />
              <FeatureCard
                icon={<Users className="w-5 h-5" style={{ color: '#4A6580' }} />}
                iconBg="#E8EDF2"
                title="Multi-Client Agency View"
                description="All clients in one dashboard. Filter by account manager, sorted by health score."
              />
              <FeatureCard
                icon={<Target className="w-5 h-5" style={{ color: '#4A6580' }} />}
                iconBg="#E8EDF2"
                title="Funnel Analysis"
                description="Cross-platform conversion funnels with stage-by-stage metrics to find where leads are dropping off."
              />
              <FeatureCard
                icon={<Bell className="w-5 h-5" style={{ color: '#4A7C59' }} />}
                iconBg="#EAF0EB"
                title="Anomaly Alerts"
                description="Automatic flags when performance drifts outside expected ranges — caught before they become costly."
              />
              <FeatureCard
                icon={<Link2 className="w-5 h-5" style={{ color: '#4A6580' }} />}
                iconBg="#E8EDF2"
                title="Platform Integrations"
                description="Native connectors for Google Ads, Meta Ads, and GA4 with automatic spend data sync."
              />
              <FeatureCard
                icon={<CheckCircle2 className="w-5 h-5" style={{ color: '#4A6580' }} />}
                iconBg="#E8EDF2"
                title="Playbook & Library"
                description="Store SOPs, channel specs, brand guidelines, and onboarding docs in a searchable team library."
              />
            </div>
            <div className="text-center mt-10">
              <Link href="/features">
                <Button variant="outline" size="lg" className="text-base px-8 py-5 h-auto group">
                  See all features
                  <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="py-24" style={{ background: '#1C1917' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center space-y-6">
              <h2
                className="text-3xl md:text-4xl font-bold"
                style={{ color: '#F5F3EF', ...pageFont }}
              >
                Ready to take control of your agency?
              </h2>
              <p className="text-base" style={{ color: '#A8A39A' }}>
                Start free. Upgrade as your client roster grows. No credit card required.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Link href={ctaHref}>
                  <Button size="lg" className="text-base px-8 py-5 h-auto bg-white text-stone-900 hover:bg-stone-100 group">
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
