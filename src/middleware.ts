import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Database } from '@/types/database';

// Define public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/',
  '/auth/login',
  '/auth/signup',
  '/auth/callback',
  '/api/nango/webhook', // Webhook endpoint
];

// Define API routes that require authentication
const PROTECTED_API_ROUTES = [
  '/api/ads/',
  '/api/clients/',
  '/api/connections/',
  '/api/integrations/',
  '/api/nango/session-token',
  '/api/action-points',
  '/api/agency/',
  '/api/media-channel-library',
];

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Check if the route is public
  const isPublicRoute = PUBLIC_ROUTES.some(route =>
    req.nextUrl.pathname.startsWith(route)
  );

  // Check if it's a protected API route
  const isProtectedApiRoute = PROTECTED_API_ROUTES.some(route =>
    req.nextUrl.pathname.startsWith(route)
  );

  // For webhook endpoints, skip Supabase auth (they use their own verification)
  if (req.nextUrl.pathname === '/api/nango/webhook') {
    return res;
  }

  // Get session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Redirect to login if accessing protected route without session
  if (!isPublicRoute && !session) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/auth/login';
    redirectUrl.searchParams.set('redirectTo', req.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Block unauthenticated API requests
  if (isProtectedApiRoute && !session) {
    return NextResponse.json(
      { error: 'Unauthorized - Please log in' },
      { status: 401 }
    );
  }

  // Redirect to dashboard if accessing auth pages while logged in
  if (isPublicRoute && session && req.nextUrl.pathname.startsWith('/auth/')) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
