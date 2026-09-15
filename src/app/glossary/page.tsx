import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '@/components/Footer';

const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };
const serifFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };

export const metadata: Metadata = {
  title: 'Glossary',
  description: 'Plain-English definitions of the media-buying and campaign-pacing terms agencies use every day — pacing, CPA, flight dates, health score, anomaly detection, and more.',
  alternates: { canonical: '/glossary' },
  openGraph: {
    title: 'Glossary — PlanPulse',
    description: 'Plain-English definitions of the media-buying and campaign-pacing terms agencies use every day.',
    url: '/glossary',
  },
};

interface Term {
  id: string;
  term: string;
  definition: React.ReactNode;
}

const TERMS: Term[] = [
  {
    id: 'pacing',
    term: 'Pacing (Campaign Pacing)',
    definition: (
      <>
        How actual spend on a campaign compares to what was planned for this point in its{' '}
        <a href="#flight-dates">flight</a>. A campaign is &quot;on pace&quot; when actual and planned spend track
        closely; overpacing and underpacing describe the two ways it can drift. See{' '}
        <Link href="/blog/setup-mistakes-that-break-campaign-pacing">common setup mistakes that break pacing</Link>.
      </>
    ),
  },
  {
    id: 'delivery-pacing',
    term: 'Delivery Pacing',
    definition:
      "The ad platform's own algorithm for spreading a budget across a day or period — it can front-load, back-load, or spread delivery evenly depending on the budget type and auction conditions, independent of what an agency intended.",
  },
  {
    id: 'cpa',
    term: 'CPA (Cost Per Acquisition)',
    definition: (
      <>
        The average amount spent to generate one conversion (a lead, sale, or signup). See{' '}
        <Link href="/blog/catching-cpa-spend-anomalies">catching CPA anomalies before they cost you</Link>.
      </>
    ),
  },
  {
    id: 'roas',
    term: 'ROAS (Return on Ad Spend)',
    definition: 'Revenue generated per dollar of ad spend, usually expressed as a ratio (e.g. 4x) — the revenue-side counterpart to CPA.',
  },
  {
    id: 'budget-variance',
    term: 'Budget Variance',
    definition: 'The dollar or percentage gap between planned spend and actual spend for a given channel or period — the raw number that pacing alerts are built on top of.',
  },
  {
    id: 'flight-dates',
    term: 'Flight Dates',
    definition: "The start and end dates a channel or campaign is scheduled to be active. A media plan's flight dates don't always match the overall campaign period — different channels can flight independently.",
  },
  {
    id: 'health-score',
    term: 'Health Score',
    definition: "A single score summarizing a client account's overall status — in PlanPulse, a weighted average of budget pacing (44%), action point completion (28%), and performance against target (28%), customisable per client.",
  },
  {
    id: 'daily-vs-lifetime-budget',
    term: 'Daily vs. Lifetime Budget',
    definition: (
      <>
        Two different budget types in Google Ads and Meta: a daily budget targets an average daily spend the
        platform can flex above; a lifetime budget targets a fixed total across a set date range. Mixing the two
        up is the most common cause of campaign overpacing — see{' '}
        <Link href="/blog/daily-vs-lifetime-budget-overspend">the full breakdown</Link>.
      </>
    ),
  },
  {
    id: 'overpacing-underpacing',
    term: 'Overpacing / Underpacing',
    definition: 'Overpacing: a campaign spending faster than planned relative to its flight, risking running out of budget early. Underpacing: spending slower than planned, risking leftover budget at flight-end.',
  },
  {
    id: 'geotargeting',
    term: 'Geotargeting',
    definition: "The location settings that determine where a campaign's ads are eligible to show. Misconfigured geotargeting — often left on an \"interest-based\" expansion setting instead of a strict location match — is a common, easy-to-miss setup error.",
  },
  {
    id: 'anomaly-detection',
    term: 'Anomaly Detection',
    definition: (
      <>
        Automatically flagging when a metric (CPA, ROAS, CPC) moves meaningfully away from its own recent
        baseline — typically using a rolling window (e.g. 7 days) rather than a single fixed target, so genuine
        trends stand out from normal day-to-day noise. See{' '}
        <Link href="/blog/catching-cpa-spend-anomalies">how rolling baselines catch drift early</Link>.
      </>
    ),
  },
  {
    id: 'media-plan',
    term: 'Media Plan',
    definition: (
      <>
        A structured plan of which channels a campaign will run on, with budgets, flight dates, and goals per
        channel — the reference document actual spend and pacing get checked against. See{' '}
        <Link href="/blog/multi-channel-media-plan-guide">how to build one that holds up</Link>.
      </>
    ),
  },
  {
    id: 'gantt-timeline',
    term: 'Gantt Timeline',
    definition: "A horizontal-bar visualisation of a media plan showing every channel's flight dates side by side — useful for spotting overlaps, gaps, and drift across channels at a glance.",
  },
  {
    id: 'setup-audit',
    term: 'Setup Audit',
    definition: "A check of a live campaign's configuration (geotargeting, destination URLs, budget type, conversion tracking) against what it was supposed to be — distinct from a performance review, since a campaign can be perfectly configured and still underperform, or badly misconfigured and still look fine on the surface.",
  },
  {
    id: 'action-point',
    term: 'Action Point',
    definition: 'A discrete task tied to a campaign or client — typically either a one-off SET UP task (a pre-launch step) or a recurring HEALTH CHECK task (a periodic review), with due dates derived from campaign dates.',
  },
  {
    id: 'utm-parameters',
    term: 'UTM Parameters',
    definition: 'Tags appended to a destination URL (source, medium, campaign, etc.) that let analytics tools attribute traffic and conversions back to the specific ad, campaign, or channel that generated the click.',
  },
  {
    id: 'attribution-window',
    term: 'Attribution Window',
    definition: 'The length of time after an ad interaction during which a resulting conversion is still credited to that ad — e.g. a 7-day click / 1-day view window. Mismatched windows between an ad platform and an analytics tool are a common source of reporting discrepancies.',
  },
  {
    id: 'dayparting',
    term: 'Dayparting (Ad Scheduling)',
    definition: 'Restricting when a campaign is eligible to serve — specific hours or days of the week — usually set to match when an audience is actually likely to convert. Left over from a previous campaign, it can silently cap how much a campaign is able to spend.',
  },
  {
    id: 'channel-library',
    term: 'Channel Library',
    definition: "A reusable reference of channel specs, SOPs, and past media plan structures an agency has already built — so a new client's plan starts from what's worked before instead of a blank page.",
  },
];

export default function GlossaryPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name: 'PlanPulse Media Buying Glossary',
    hasDefinedTerm: TERMS.map((t) => ({
      '@type': 'DefinedTerm',
      name: t.term,
      url: `https://www.planpulse.nz/glossary#${t.id}`,
    })),
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#F5F3EF', ...pageFont }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="flex-1">
        <section className="py-24 md:py-28" style={{ background: '#F5F3EF' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center space-y-5">
              <span
                className="inline-block text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
                style={{ background: '#E8EDF2', color: '#4A6580' }}
              >
                Glossary
              </span>
              <h1
                className="text-4xl md:text-5xl font-bold leading-tight"
                style={{ color: '#1C1917', ...serifFont, letterSpacing: '-0.02em' }}
              >
                Media-buying &amp; pacing terms
              </h1>
              <p className="text-lg" style={{ color: '#8A8578' }}>
                Plain-English definitions of the terms agencies use every day when planning and running campaigns.
              </p>
            </div>
          </div>
        </section>

        <section className="pb-24" style={{ background: '#F5F3EF' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto space-y-6">
              {TERMS.map((t) => (
                <div
                  key={t.id}
                  id={t.id}
                  className="rounded-[16px] p-6 scroll-mt-24"
                  style={{
                    background: '#FDFCF8',
                    border: '1px solid rgba(232,228,220,0.7)',
                  }}
                >
                  <h2 className="text-lg font-semibold mb-2" style={{ color: '#1C1917' }}>
                    {t.term}
                  </h2>
                  <p className="text-sm leading-relaxed" style={{ color: '#8A8578' }}>
                    {t.definition}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
