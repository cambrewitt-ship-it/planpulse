'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Footer from '@/components/Footer';
import { Check, ArrowRight } from 'lucide-react';

const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };
const serifFont: React.CSSProperties = { fontFamily: "'DM Serif Display', Georgia, serif" };

type Period = 'monthly' | 'annual';

interface PlanConfig {
  id: string;
  name: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  tagline: string;
  features: string[];
  featured?: boolean;
  badge?: string;
}

const plans: PlanConfig[] = [
  {
    id: 'free',
    name: 'Free',
    monthlyPrice: null,
    annualPrice: null,
    tagline: 'Get started with one client at no cost — no credit card required.',
    features: [
      '1 client',
      'Media plan builder',
      'Health scoring',
      'Action points & task management',
      'Basic analytics',
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 99,
    annualPrice: 990,
    tagline: 'Solo operators or small agencies testing the platform.',
    features: [
      '5 clients · 2 users',
      'Health scoring + portfolio view',
      'Media plan builder',
      'Google Ads + Meta sync',
      'Action points + task management',
      'AI daily briefing (Teams or email)',
      '5 AI chat messages/day',
      'PDF report export',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    monthlyPrice: 249,
    annualPrice: 2490,
    tagline: 'Growing agencies managing a range of client types.',
    features: [
      '15 clients · 5 users · GA4 included',
      'Everything in Starter',
      'GA4 integration',
      'Unlimited AI chat (action-taking)',
      'Funnel analysis cross-platform',
      'Anomaly detection alerts',
      'Client Intelligence Hub (briefs, goals)',
      'Invoice generator',
      'Playbook + channel library',
    ],
    featured: true,
    badge: 'Most popular',
  },
  {
    id: 'agency',
    name: 'Agency',
    monthlyPrice: 549,
    annualPrice: 5490,
    tagline: 'Full-service agencies needing unlimited scale.',
    features: [
      'Unlimited clients · 10 users',
      'Everything in Growth',
      'White-label reports (your logo)',
      'Client portal (read-only access)',
      'Priority support',
      'Slack integration',
      'Custom onboarding session',
    ],
  },
];

function PlanCard({
  plan,
  period,
  onCheckout,
  loading,
}: {
  plan: PlanConfig;
  period: Period;
  onCheckout: (planId: string, period: Period) => void;
  loading: boolean;
}) {
  const isFree = plan.monthlyPrice === null;
  const price = period === 'annual' && plan.annualPrice !== null
    ? Math.round(plan.annualPrice / 12)
    : plan.monthlyPrice;

  return (
    <div
      className="relative flex flex-col rounded-[18px] p-8"
      style={
        plan.featured
          ? {
              background: '#1C1917',
              border: '2px solid #1C1917',
              boxShadow: '0 8px 40px rgba(0,0,0,0.18), 0 2px 10px rgba(0,0,0,0.10)',
            }
          : {
              background: '#FDFCF8',
              border: '1px solid rgba(232,228,220,0.7)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)',
            }
      }
    >
      {plan.badge && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-4 py-1 rounded-full whitespace-nowrap"
          style={{ background: '#4A7C59', color: '#fff' }}
        >
          {plan.badge}
        </div>
      )}

      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: plan.featured ? '#A8A39A' : '#8A8578' }}>
          {plan.name}
        </p>
        {isFree ? (
          <div className="text-4xl font-bold mb-2" style={{ color: plan.featured ? '#F5F3EF' : '#1C1917', ...serifFont }}>
            Free
          </div>
        ) : (
          <div className="flex items-end gap-1 mb-1">
            <span className="text-4xl font-bold" style={{ color: plan.featured ? '#F5F3EF' : '#1C1917', ...serifFont }}>
              ${price}
            </span>
            <span className="text-sm mb-1" style={{ color: plan.featured ? '#A8A39A' : '#8A8578' }}>/month</span>
          </div>
        )}
        {period === 'annual' && !isFree && (
          <p className="text-xs mb-2" style={{ color: plan.featured ? '#6FCF97' : '#4A7C59' }}>
            ${plan.annualPrice}/year · 2 months free
          </p>
        )}
        <p className="text-sm leading-relaxed" style={{ color: plan.featured ? '#A8A39A' : '#8A8578' }}>
          {plan.tagline}
        </p>
      </div>

      <ul className="space-y-3 flex-1 mb-8">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <Check
              className="w-4 h-4 mt-0.5 shrink-0"
              style={{ color: plan.featured ? '#6FCF97' : '#4A7C59' }}
            />
            <span className="text-sm" style={{ color: plan.featured ? '#D6D0C8' : '#5C5650' }}>
              {feature}
            </span>
          </li>
        ))}
      </ul>

      {isFree ? (
        <Link href="/auth/login" className="mt-auto">
          <Button className="w-full" size="lg" variant="outline">
            Start for free
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </Link>
      ) : (
        <Button
          className="w-full mt-auto"
          size="lg"
          disabled={loading}
          style={plan.featured ? { background: '#F5F3EF', color: '#1C1917' } : undefined}
          variant={plan.featured ? undefined : 'outline'}
          onClick={() => onCheckout(plan.id, period)}
        >
          {loading ? 'Redirecting…' : 'Get started'}
          {!loading && <ArrowRight className="ml-2 w-4 h-4" />}
        </Button>
      )}
    </div>
  );
}

export default function PricingPage() {
  const [period, setPeriod] = useState<Period>('monthly');
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const router = useRouter();

  const handleCheckout = async (planId: string, selectedPeriod: Period) => {
    setLoadingPlan(planId);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId, period: selectedPeriod }),
      });

      if (res.status === 401) {
        router.push(`/auth/login?redirect=/pricing`);
        return;
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error('No checkout URL returned', data);
      }
    } catch (err) {
      console.error('Checkout error', err);
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#F5F3EF', ...pageFont }}>
      <main className="flex-1">
        {/* Hero */}
        <section className="py-24 md:py-28" style={{ background: '#F5F3EF' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center space-y-5">
              <span
                className="inline-block text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
                style={{ background: '#E8EDF2', color: '#4A6580' }}
              >
                Pricing
              </span>
              <h1
                className="text-4xl md:text-5xl font-bold leading-tight"
                style={{ color: '#1C1917', ...serifFont, letterSpacing: '-0.02em' }}
              >
                Simple, transparent pricing
              </h1>
              <p className="text-lg" style={{ color: '#8A8578' }}>
                Start free, scale as you grow. Annual billing saves you 2 months every year.
              </p>

              {/* Billing toggle */}
              <div className="flex items-center justify-center gap-3 pt-2">
                <span className="text-sm font-medium" style={{ color: period === 'monthly' ? '#1C1917' : '#8A8578' }}>
                  Monthly
                </span>
                <button
                  onClick={() => setPeriod(p => p === 'monthly' ? 'annual' : 'monthly')}
                  className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none"
                  style={{ background: period === 'annual' ? '#4A7C59' : '#C4BFB8' }}
                  aria-label="Toggle billing period"
                >
                  <span
                    className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                    style={{ transform: period === 'annual' ? 'translateX(24px)' : 'translateX(4px)' }}
                  />
                </button>
                <span className="text-sm font-medium" style={{ color: period === 'annual' ? '#1C1917' : '#8A8578' }}>
                  Annual
                  <span
                    className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: '#E8F5EE', color: '#4A7C59' }}
                  >
                    2 months free
                  </span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Plans Grid */}
        <section className="pb-24" style={{ background: '#F5F3EF' }}>
          <div className="container mx-auto px-4">
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-6 max-w-7xl mx-auto items-start">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  period={period}
                  onCheckout={handleCheckout}
                  loading={loadingPlan === plan.id}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Feature comparison table */}
        <section className="py-20" style={{ background: '#F5F3EF' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-2xl font-bold text-center mb-10" style={{ color: '#1C1917', ...serifFont }}>
                Compare plans
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(232,228,220,0.7)' }}>
                      <th className="text-left py-3 pr-6 font-medium" style={{ color: '#8A8578', width: '40%' }}>Feature</th>
                      {['Free', 'Starter', 'Growth', 'Agency'].map((plan) => (
                        <th key={plan} className="text-center py-3 px-3 font-semibold" style={{ color: '#1C1917' }}>
                          {plan}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Clients', '1', '5', '15', 'Unlimited'],
                      ['Users', '1', '2', '5', '10'],
                      ['Health scoring', '✓', '✓', '✓', '✓'],
                      ['Media plan builder', '✓', '✓', '✓', '✓'],
                      ['Action points & tasks', '✓', '✓', '✓', '✓'],
                      ['Google Ads + Meta sync', '—', '✓', '✓', '✓'],
                      ['GA4 integration', '—', '—', '✓', '✓'],
                      ['AI daily briefing', '—', '✓', '✓', '✓'],
                      ['AI chat messages/day', '—', '5', 'Unlimited', 'Unlimited'],
                      ['Funnel analysis', '—', '—', '✓', '✓'],
                      ['Anomaly detection', '—', '—', '✓', '✓'],
                      ['Client Intelligence Hub', '—', '—', '✓', '✓'],
                      ['Invoice generator', '—', '—', '✓', '✓'],
                      ['Playbook & channel library', '—', '—', '✓', '✓'],
                      ['PDF report export', '—', '✓', '✓', '✓'],
                      ['White-label reports', '—', '—', '—', '✓'],
                      ['Client portal', '—', '—', '—', '✓'],
                      ['Slack integration', '—', '—', '—', '✓'],
                      ['Priority support', '—', '—', '—', '✓'],
                      ['Custom onboarding', '—', '—', '—', '✓'],
                    ].map(([feature, free, starter, growth, agency]) => (
                      <tr key={feature} style={{ borderBottom: '1px solid rgba(232,228,220,0.5)' }}>
                        <td className="py-3 pr-6" style={{ color: '#5C5650' }}>{feature}</td>
                        {[free, starter, growth, agency].map((val, i) => (
                          <td
                            key={i}
                            className="py-3 px-3 text-center"
                            style={{ color: val === '—' ? '#C4BFB8' : val === '✓' ? '#4A7C59' : '#1C1917', fontWeight: val === '✓' ? 600 : 400 }}
                          >
                            {val}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24" style={{ background: '#1C1917' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center space-y-6">
              <h2 className="text-3xl md:text-4xl font-bold" style={{ color: '#F5F3EF', ...serifFont }}>
                Start free, upgrade when you&apos;re ready
              </h2>
              <p className="text-base" style={{ color: '#A8A39A' }}>
                No credit card required. Cancel or change plans at any time.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
                <Link href="/auth/login">
                  <Button size="lg" className="text-base px-8 py-5 h-auto bg-white text-stone-900 hover:bg-stone-100 group">
                    Get started free
                    <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                <Link href="/features">
                  <Button size="lg" variant="outline" className="text-base px-8 py-5 h-auto border-stone-600 text-stone-300 hover:bg-stone-800 hover:text-white">
                    Explore features
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
