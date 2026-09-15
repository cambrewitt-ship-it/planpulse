import type { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/blog';

const SITE_URL = 'https://www.planpulse.nz';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/features`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/pricing`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/blog`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/glossary`, changeFrequency: 'monthly', priority: 0.6 },
  ];

  const postRoutes: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.date,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  return [...staticRoutes, ...postRoutes];
}
