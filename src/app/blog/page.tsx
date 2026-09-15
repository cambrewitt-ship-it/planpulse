import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import Footer from '@/components/Footer';
import { getAllPosts } from '@/lib/blog';

const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };
const serifFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Agency media-buying guides on campaign pacing, setup audits, media planning, and anomaly detection — drawn from real campaign issues, not generic advice.',
  alternates: { canonical: '/blog' },
  openGraph: {
    title: 'Blog — PlanPulse',
    description: 'Agency media-buying guides on campaign pacing, setup audits, media planning, and anomaly detection.',
    url: '/blog',
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#F5F3EF', ...pageFont }}>
      <main className="flex-1">
        <section className="py-24 md:py-28" style={{ background: '#F5F3EF' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center space-y-5">
              <span
                className="inline-block text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
                style={{ background: '#E8EDF2', color: '#4A6580' }}
              >
                Blog
              </span>
              <h1
                className="text-4xl md:text-5xl font-bold leading-tight"
                style={{ color: '#1C1917', ...serifFont, letterSpacing: '-0.02em' }}
              >
                Agency media-buying guides
              </h1>
              <p className="text-lg" style={{ color: '#8A8578' }}>
                Real setup mistakes and pacing issues we&apos;ve seen running an agency and building the
                agents that audit for them — not generic advice.
              </p>
            </div>
          </div>
        </section>

        <section className="pb-24" style={{ background: '#F5F3EF' }}>
          <div className="container mx-auto px-4">
            <div className="grid sm:grid-cols-2 gap-6 max-w-5xl mx-auto">
              {posts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="group flex flex-col rounded-[18px] overflow-hidden transition-shadow"
                  style={{
                    background: '#FDFCF8',
                    border: '1px solid rgba(232,228,220,0.7)',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)',
                  }}
                >
                  <div className="relative aspect-[2/1] overflow-hidden">
                    <Image
                      src={post.ogImage}
                      alt=""
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-6 flex flex-col gap-2">
                    <span className="text-xs font-medium uppercase tracking-widest" style={{ color: '#8A8578' }}>
                      {formatDate(post.date)}
                    </span>
                    <h2 className="text-lg font-semibold leading-snug" style={{ color: '#1C1917' }}>
                      {post.title}
                    </h2>
                    <p className="text-sm leading-relaxed" style={{ color: '#8A8578' }}>
                      {post.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
