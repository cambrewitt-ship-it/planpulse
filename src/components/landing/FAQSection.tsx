'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Reveal } from '@/components/landing/Reveal';

const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };

export interface FAQItem {
  question: string;
  answer: string;
}

// Single source of truth for both the visible FAQ UI and the FAQPage JSON-LD
// emitted alongside it — answer-first and specific, since that's what search
// and AI-answer engines (Google AI Overviews, ChatGPT, Perplexity) extract.
export const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'What is PlanPulse?',
    answer:
      'PlanPulse is agentic AI software for marketing agencies. It combines multi-channel media planning, live campaign pacing and performance tracking across Google Ads, Meta, and GA4, and AI agents that audit account setup, catch spend anomalies, and handle busywork like invoicing.',
  },
  {
    question: 'How does the Health Check Agent work?',
    answer:
      'The Health Check Agent audits a live Google Ads or Meta campaign against its intended setup — geotargeting, destination URLs, and budget type — and flags discrepancies like a campaign targeting the wrong country or running on a daily budget when it should be lifetime. It surfaces the issues in plain English and can help you fix them.',
  },
  {
    question: 'Which ad platforms does PlanPulse connect to?',
    answer:
      'PlanPulse natively connects to Google Ads, Meta Ads, and Google Analytics 4 via secure OAuth connections (powered by Nango). Spend, performance, and pacing data sync automatically once an account is linked.',
  },
  {
    question: 'Is there a free plan?',
    answer:
      'Yes. The Free plan supports one client with the media plan builder, health scoring, and action point task management — no credit card required. Paid plans start at $99/month for agencies managing more clients.',
  },
  {
    question: 'Does PlanPulse replace spreadsheets for media planning?',
    answer:
      'Yes — PlanPulse replaces the spreadsheet-and-slide-deck workflow most agencies use for media plans. You can import an existing spreadsheet plan or build one from scratch, then track actual spend against it automatically instead of updating it by hand.',
  },
  {
    question: "How is a campaign's health score calculated?",
    answer:
      "Each client's health score is a weighted average of budget pacing (44%), action point completion (28%), and performance against target (28%). Weights are customisable per client, and the score updates automatically as new data syncs in.",
  },
];

function faqItemId(index: number) {
  return `faq-${index}`;
}

export function FAQJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="py-20" style={{ background: '#F5F3EF' }}>
      <div className="container mx-auto px-4">
        <Reveal className="text-center mb-12 max-w-2xl mx-auto">
          <span
            className="inline-block text-xs font-semibold uppercase tracking-widest mb-3 px-3 py-1 rounded-full"
            style={{ background: '#E8EDF2', color: '#4A6580' }}
          >
            FAQ
          </span>
          <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#1C1917', ...pageFont }}>
            Frequently asked questions
          </h2>
        </Reveal>

        <Reveal className="max-w-3xl mx-auto space-y-3">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={item.question}
                className="rounded-[16px] overflow-hidden"
                style={{
                  background: '#FDFCF8',
                  border: '1px solid rgba(232,228,220,0.7)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  aria-expanded={isOpen}
                  aria-controls={faqItemId(index)}
                  className="w-full flex items-center justify-between gap-4 text-left px-6 py-5"
                  style={pageFont}
                >
                  <span className="font-semibold" style={{ color: '#1C1917' }}>
                    {item.question}
                  </span>
                  <ChevronDown
                    className="w-5 h-5 shrink-0 transition-transform"
                    style={{ color: '#8A8578', transform: isOpen ? 'rotate(180deg)' : 'none' }}
                  />
                </button>
                {isOpen && (
                  <div id={faqItemId(index)} className="px-6 pb-5 -mt-1">
                    <p className="text-sm leading-relaxed" style={{ color: '#8A8578' }}>
                      {item.answer}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
