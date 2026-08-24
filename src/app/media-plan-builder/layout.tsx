import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Media Plan Builder — PlanPulse',
  description: 'Plan and edit media budgets on a visual weekly timeline — upload an existing plan or start from scratch. Free, no account needed.',
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'PlanPulse Media Plan Builder',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description: 'Plan, budget, and visualise a media schedule on a drag-and-drop weekly timeline. Upload an existing plan or start from scratch — free, no account needed.',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
};

export default function MediaPlanBuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
