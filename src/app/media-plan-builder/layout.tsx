import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Media Plan Builder',
  description: 'Plan and edit media budgets on a visual weekly timeline — upload an existing plan or start from scratch. Free, no account needed.',
  // Password-gated (src/middleware.ts) — excluded from the sitemap and not
  // eligible for indexing until the gate comes off, but noindex explicitly
  // in case the gate is ever lifted without revisiting this file.
  robots: { index: false, follow: false },
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
