'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import Footer from '@/components/Footer';
import { supabase } from '@/lib/supabase/client';
import {
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import {
  MediaPlanMockup,
} from '@/components/features/FeatureMockups';
import AgentShowcase from '@/components/features/AgentShowcase';
import { Reveal, RevealStagger, RevealStaggerItem } from '@/components/landing/Reveal';
import { RotatingWord } from '@/components/landing/RotatingWord';
import HeroWalkthroughSlideshow from '@/components/landing/HeroWalkthroughSlideshow';
import { CONNECT_PLATFORMS } from '@/components/landing/PlatformLogos';

const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };
const HERO_ROTATING_WORDS = ['Health checking', 'Media planning', 'Ad performance', 'AI automation'];
const PLATFORM_ICON_SIZE = 70;
const PLATFORM_CENTER_ICON_SIZE = 86;
const PLATFORM_RING_RADIUS = 80;
const PLATFORM_RING_SIZE = PLATFORM_RING_RADIUS * 2 + PLATFORM_ICON_SIZE;
const META_PLATFORM = CONNECT_PLATFORMS.find((platform) => platform.id === 'meta')!;
const RING_PLATFORMS = CONNECT_PLATFORMS.filter((platform) => platform.id !== 'meta');

function FeatureChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm" style={{ color: '#5C5650' }}>
      <span style={{ color: '#4A7C59' }}>{icon}</span>
      {label}
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
        <section className="relative py-20 md:py-28" style={{ background: '#F5F3EF' }}>
          {/* Decorative gradient blobs — top offset deliberately not clipped so they
              bleed up behind the transparent top bar and match it seamlessly at
              scroll-top. Kept flush to left-0/right-0 (no negative x offset) so they
              never push past the viewport edges and cause horizontal scroll. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 left-0 w-[280px] sm:w-[420px] h-[280px] sm:h-[420px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(74,124,89,0.16) 0%, rgba(74,124,89,0) 70%)', filter: 'blur(20px)' }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 right-0 w-[300px] sm:w-[480px] h-[300px] sm:h-[480px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(74,101,128,0.14) 0%, rgba(74,101,128,0) 70%)', filter: 'blur(20px)' }}
          />
          <div className="container relative mx-auto px-4">
            <div className="max-w-7xl mx-auto xl:pl-10 grid grid-cols-1 xl:grid-cols-[max-content_1fr] gap-10 xl:gap-12 items-start">
              <Reveal delay={0}>
                <h1
                  className="leading-[0.95] text-[clamp(2rem,8vw,2.75rem)] md:text-[clamp(2.75rem,5vw,4.5rem)]"
                  style={{
                    color: '#1C1917',
                    ...pageFont,
                    fontWeight: 900,
                    letterSpacing: '-0.03em',
                  }}
                >
                  <span className="block"><RotatingWord words={HERO_ROTATING_WORDS} gradient="linear-gradient(135deg, #3E6A4E 0%, #4A7C59 100%)" /></span>
                  <span className="block">software for</span>
                  <span className="block">marketing agencies</span>
                </h1>
              </Reveal>
              <div className="space-y-5">
                <Reveal delay={0.08}>
                  <p
                    className="leading-tight"
                    style={{
                      color: '#1C1917',
                      ...pageFont,
                      fontWeight: 900,
                      letterSpacing: '-0.03em',
                      fontSize: 'clamp(1.5rem, 2.6vw, 29px)',
                    }}
                  >
                    Catch problems before they{' '}
                    <span
                      style={{
                        background: 'linear-gradient(135deg, #B91C1C 0%, #EF4444 100%)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        color: 'transparent',
                      }}
                    >
                      cost you.
                    </span>
                  </p>
                </Reveal>
                <Reveal delay={0.18}>
                  <div className="space-y-3 text-lg" style={{ color: '#8A8578' }}>
                    <p>Track live pacing and performance across every ad platform.</p>
                    <p>AI agents handle health checks and busywork - cutting the errors that cost you clients.</p>
                  </div>
                </Reveal>
                <Reveal delay={0.26}>
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <Link href={ctaHref}>
                      <Button
                        size="lg"
                        className="text-base px-6 py-2.5 h-auto rounded-full group text-white border-0"
                        style={{ background: 'linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 100%)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #172554 0%, #1E40AF 100%)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 100%)'; }}
                      >
                        Get started free
                        <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                      </Button>
                    </Link>
                    <Link href="/features">
                      <Button
                        size="lg"
                        variant="outline"
                        className="text-base px-6 py-2.5 h-auto rounded-full bg-white text-stone-900 border-white hover:bg-white/90 hover:text-stone-900"
                      >
                        Explore features
                      </Button>
                    </Link>
                  </div>
                </Reveal>
              </div>
            </div>

            {/* Product showcase — screen recording drops in here */}
            <Reveal delay={0.32} className="max-w-4xl mx-auto mt-16 md:mt-20">
              <div
                className="relative rounded-[20px] overflow-hidden aspect-video"
                style={{
                  background: '#FDFCF8',
                  border: '1px solid rgba(232,228,220,0.7)',
                  boxShadow: '0 8px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
                }}
              >
                <HeroWalkthroughSlideshow />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── AI Agent showcase ── */}
        <Reveal>
          <AgentShowcase />
        </Reveal>

        {/* ── Connect your platforms ── */}
        <section className="py-10" style={{ background: '#FDFCF8' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-10">
              <div className="text-center lg:text-left">
                <Reveal>
                  <h2 className="text-3xl md:text-4xl font-bold" style={{ color: '#1C1917', ...pageFont }}>
                    Connect your platforms
                  </h2>
                </Reveal>
              </div>

              <RevealStagger
                className="relative shrink-0 mx-auto"
                style={{ width: PLATFORM_RING_SIZE, height: PLATFORM_RING_SIZE }}
              >
                <RevealStaggerItem
                  className="absolute flex items-center justify-center rounded-full"
                  style={{
                    width: PLATFORM_CENTER_ICON_SIZE,
                    height: PLATFORM_CENTER_ICON_SIZE,
                    left: `calc(50% - ${PLATFORM_CENTER_ICON_SIZE / 2}px)`,
                    top: `calc(50% - ${PLATFORM_CENTER_ICON_SIZE / 2}px)`,
                    background: '#FFFFFF',
                    border: '1px solid rgba(232,228,220,0.9)',
                    boxShadow: '0 4px 16px rgba(28,25,23,0.12)',
                    zIndex: 1,
                  }}
                >
                  <span title={META_PLATFORM.label} className="flex items-center justify-center">
                    <META_PLATFORM.Logo size={40} />
                    <span className="sr-only">{META_PLATFORM.label}</span>
                  </span>
                </RevealStaggerItem>

                {RING_PLATFORMS.map((platform, i) => {
                  const angle = (i / RING_PLATFORMS.length) * Math.PI * 2 - Math.PI / 2;
                  const x = Math.cos(angle) * PLATFORM_RING_RADIUS;
                  const y = Math.sin(angle) * PLATFORM_RING_RADIUS;
                  return (
                    <RevealStaggerItem
                      key={platform.id}
                      className="absolute flex items-center justify-center rounded-full"
                      style={{
                        width: PLATFORM_ICON_SIZE,
                        height: PLATFORM_ICON_SIZE,
                        left: `calc(50% + ${x}px - ${PLATFORM_ICON_SIZE / 2}px)`,
                        top: `calc(50% + ${y}px - ${PLATFORM_ICON_SIZE / 2}px)`,
                        background: '#FFFFFF',
                        border: '1px solid rgba(232,228,220,0.8)',
                        boxShadow: '0 2px 10px rgba(28,25,23,0.07)',
                      }}
                    >
                      <span title={platform.label} className="flex items-center justify-center">
                        <platform.Logo size={30} />
                        <span className="sr-only">{platform.label}</span>
                      </span>
                    </RevealStaggerItem>
                  );
                })}
              </RevealStagger>

              <Reveal delay={0.2}>
                <div className="flex items-center gap-2 justify-center lg:justify-start lg:pl-16">
                  <span className="text-sm uppercase tracking-widest" style={{ color: '#8A8578' }}>Secured by</span>
                  <img src="/nango.png" alt="Nango" className="h-8 w-auto" />
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── Channel Performance showcase ── */}
        <section className="py-20" style={{ background: '#FDFCF8' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
              <Reveal className="order-2 lg:order-1" delay={0.1}>
                <div
                  className="transition-transform duration-500 hover:-translate-y-1"
                  style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)', borderRadius: 20, overflow: 'hidden' }}
                >
                  <Image
                    src="/channel-performance.png"
                    alt="Real-time performance dashboard showing pacing, spend variance, and platform metrics"
                    width={2002}
                    height={1502}
                    className="w-full h-auto"
                  />
                </div>
              </Reveal>
              <Reveal className="order-1 lg:order-2 space-y-6">
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
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── CPA gauge showcase ── */}
        <section className="py-20" style={{ background: '#F5F3EF' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto grid lg:grid-cols-[0.8fr_1.2fr] gap-12 items-center">
              <Reveal className="space-y-6">
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
                  7-day rolling CPA charts with target thresholds show you the moment a metric crosses target. The gauge turns red — you act before it becomes a budget blowout.
                </p>
                <div className="space-y-3 pt-2">
                  <FeatureChip icon={<CheckCircle2 className="w-4 h-4" />} label="Rolling CPA, ROAS, and CPC trend monitoring" />
                  <FeatureChip icon={<CheckCircle2 className="w-4 h-4" />} label="Red/green gauge shows target vs. actual" />
                  <FeatureChip icon={<CheckCircle2 className="w-4 h-4" />} label="24H change indicator for rapid shifts" />
                  <FeatureChip icon={<CheckCircle2 className="w-4 h-4" />} label="Alerts surfaced in AI daily briefing" />
                </div>
              </Reveal>
              <Reveal delay={0.1}>
                <div
                  className="transition-transform duration-500 hover:-translate-y-1"
                  style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.09)', borderRadius: 20, overflow: 'hidden' }}
                >
                  <Image
                    src="/client-card.png"
                    alt="Client card showing CPA gauge within target"
                    width={2696}
                    height={614}
                    className="w-full h-auto"
                  />
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── Media Plan showcase ── */}
        <section className="py-20" style={{ background: '#FDFCF8' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
              <Reveal delay={0.1} className="order-2 lg:order-1">
                <div
                  className="transition-transform duration-500 hover:-translate-y-1"
                  style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)', borderRadius: 20, overflow: 'hidden' }}
                >
                  <MediaPlanMockup />
                </div>
              </Reveal>
              <Reveal className="order-1 lg:order-2 space-y-6">
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
                  Media planning & buying with Agentic AI
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
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="pb-24 pt-4" style={{ background: '#F5F3EF' }}>
          <div className="container mx-auto px-4">
            <Reveal>
              <div
                className="relative max-w-6xl mx-auto overflow-hidden text-center space-y-6 px-8 py-20 md:py-24"
                style={{
                  borderRadius: 32,
                  background: 'radial-gradient(120% 160% at 15% 15%, #2D4A61 0%, #1C1917 45%, #1C1917 55%, #3B5F7D 100%)',
                  boxShadow: '0 24px 64px rgba(28,25,23,0.28)',
                }}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute -bottom-24 -right-16 w-[380px] h-[380px] rounded-full"
                  style={{ background: 'radial-gradient(circle, rgba(74,101,128,0.35) 0%, rgba(74,101,128,0) 70%)', filter: 'blur(10px)' }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-20 -left-10 w-[300px] h-[300px] rounded-full"
                  style={{ background: 'radial-gradient(circle, rgba(59,95,125,0.35) 0%, rgba(59,95,125,0) 70%)', filter: 'blur(10px)' }}
                />
                <div className="relative max-w-2xl mx-auto space-y-6">
                  <h2
                    className="text-3xl md:text-4xl font-bold"
                    style={{ color: '#F5F3EF', ...pageFont }}
                  >
                    Stop stitching spreadsheets together
                  </h2>
                  <p className="text-base" style={{ color: '#D5D0C5' }}>
                    Start free. Upgrade as your client roster grows. No credit card required.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                    <Link href={ctaHref}>
                      <Button size="lg" className="text-base px-8 py-4 h-auto rounded-full bg-white text-stone-900 hover:bg-stone-100 group shadow-lg">
                        Get started free
                        <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                      </Button>
                    </Link>
                    <Link href="/pricing">
                      <Button size="lg" variant="outline" className="text-base px-8 py-4 h-auto rounded-full border-stone-500 text-stone-100 bg-transparent hover:bg-white/10 hover:text-white">
                        View pricing
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
