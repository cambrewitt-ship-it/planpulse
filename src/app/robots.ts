import type { MetadataRoute } from 'next';

const SITE_URL = 'https://www.planpulse.nz';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/features', '/pricing', '/about', '/blog', '/glossary'],
      disallow: [
        '/dashboard',
        '/agency',
        '/agents',
        '/library',
        '/plans',
        '/clients',
        '/settings',
        '/test-data',
        '/auth',
        '/hub',
        '/api',
        // Password-gated (returns 401 to unauthenticated crawlers anyway) —
        // see src/middleware.ts. Excluded here so it isn't a dead crawl entry.
        '/media-plan-builder',
        '/marketing/video',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
