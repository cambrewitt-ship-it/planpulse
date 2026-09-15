import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Simple, transparent pricing for marketing agencies. Start free with one client, then scale to Starter, Growth, or Agency plans as your client roster grows.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Pricing — PlanPulse',
    description: 'Simple, transparent pricing for marketing agencies. Start free, upgrade as your client roster grows.',
    url: '/pricing',
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
