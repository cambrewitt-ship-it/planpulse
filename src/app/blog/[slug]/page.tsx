import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import Footer from '@/components/Footer';
import { getAllPosts, getPostBySlug } from '@/lib/blog';

const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };
const serifFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description,
      url: `/blog/${post.slug}`,
      images: [{ url: post.ogImage, width: 1200, height: 630, alt: post.title }],
      publishedTime: post.date,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: [post.ogImage],
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    image: post.ogImage,
    author: { '@type': 'Organization', name: 'PlanPulse' },
    publisher: { '@type': 'Organization', name: 'PlanPulse' },
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#F5F3EF', ...pageFont }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="flex-1">
        <article className="py-20 md:py-24">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center space-y-4 mb-10">
              <time
                dateTime={post.date}
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: '#8A8578' }}
              >
                {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </time>
              <h1
                className="text-3xl md:text-5xl font-bold leading-tight"
                style={{ color: '#1C1917', ...serifFont, letterSpacing: '-0.02em' }}
              >
                {post.title}
              </h1>
            </div>

            <div
              className="max-w-3xl mx-auto mb-12 rounded-[20px] overflow-hidden relative aspect-[2/1]"
              style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)' }}
            >
              <Image src={post.ogImage} alt="" fill className="object-cover" />
            </div>

            <div
              className="prose prose-stone max-w-2xl mx-auto"
              style={{ '--tw-prose-links': '#4A6580' } as React.CSSProperties}
            >
              <MDXRemote source={post.content} />
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
