'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { LayoutDashboard, Users, LogOut, Library, Settings, Bot, HelpCircle } from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import ProductTourSpotlight from '@/components/product-tour/ProductTourSpotlight';
import { hasSeenTour, markTourSeen } from '@/lib/product-tour/tour-storage';

const TOUR_EXCLUDED_PATH_PREFIXES = ['/auth', '/hub/'];
const TOUR_EXCLUDED_EXACT_PATHS = ['/', '/clients/create'];

function isTourExcludedPath(path: string): boolean {
  if (TOUR_EXCLUDED_EXACT_PATHS.includes(path)) return true;
  if (TOUR_EXCLUDED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (/^\/clients\/[^/]+\/hub$/.test(path)) return true;
  return false;
}

export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMounted(true);
    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!mounted || !user) return;
    if (hasSeenTour()) return;
    if (isTourExcludedPath(pathname ?? '')) return;

    const timer = setTimeout(() => {
      markTourSeen();
      setTourOpen(true);
    }, 800);

    return () => clearTimeout(timer);
  }, [mounted, user, pathname]);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user ?? null);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  };

  const serifFont: React.CSSProperties = { fontFamily: "'DM Serif Display', Georgia, serif" };

  if (pathname?.startsWith('/hub/')) return null;
  if (pathname?.match(/^\/clients\/[^/]+\/hub$/)) return null;
  if (pathname?.startsWith('/marketing/video/')) return null;

  // Only the signed-out marketing nav condenses into a floating pill on scroll —
  // the authenticated app nav carries too many items for that treatment, so it
  // just gets a lighter shrink + shadow.
  const isPublicNav = !mounted || !user;
  const isFloating = isPublicNav && scrolled;
  // At the very top, the public nav is fully transparent so the hero's own
  // background (gradient blobs included) shows straight through — no visible
  // bar at all until the user scrolls.
  const isBlended = isPublicNav && !scrolled;

  return (
    <div className="sticky top-0 z-50" style={{ padding: isFloating ? '12px 16px 0' : 0 }}>
      <nav
        className="transition-all duration-300 ease-out mx-auto"
        style={{
          background: isFloating ? 'rgba(253,252,248,0.85)' : isBlended ? 'transparent' : '#FDFCF8',
          backdropFilter: isFloating ? 'blur(16px)' : 'none',
          WebkitBackdropFilter: isFloating ? 'blur(16px)' : 'none',
          maxWidth: isFloating ? 860 : '100%',
          borderRadius: isFloating ? 9999 : 0,
          border: isFloating ? '1px solid rgba(232,228,220,0.9)' : 'none',
          borderBottom: isFloating
            ? '1px solid rgba(232,228,220,0.9)'
            : isBlended
              ? '0.5px solid transparent'
              : '0.5px solid #E8E4DC',
          boxShadow: isFloating
            ? '0 10px 32px rgba(28,25,23,0.10), 0 2px 8px rgba(28,25,23,0.05)'
            : scrolled
              ? '0 1px 0 rgba(28,25,23,0.04)'
              : 'none',
        }}
      >
      <div className="container mx-auto px-4">
        <div
          className="flex items-center justify-between transition-[height] duration-300 ease-out"
          style={{ height: isFloating ? 52 : 64 }}
        >
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-bold" style={{ color: '#1C1917', fontFamily: "'DM Serif Display', Georgia, serif", letterSpacing: '-0.02em' }}>
              PlanPulse
            </Link>

            {mounted && !user && (
              <div className="hidden md:flex items-center gap-4">
                <Link href="/features">
                  <Button variant={pathname === '/features' ? 'default' : 'ghost'} size="sm">
                    Features
                  </Button>
                </Link>
                <Link href="/pricing">
                  <Button variant={pathname === '/pricing' ? 'default' : 'ghost'} size="sm">
                    Pricing
                  </Button>
                </Link>
                <Link href="/blog">
                  <Button variant={pathname?.startsWith('/blog') ? 'default' : 'ghost'} size="sm">
                    Blog
                  </Button>
                </Link>
                <Link href="/about">
                  <Button variant={pathname === '/about' ? 'default' : 'ghost'} size="sm">
                    About
                  </Button>
                </Link>
              </div>
            )}

            {mounted && user && (
              <div className="hidden md:flex items-center gap-4">
                <Link href="/agency">
                  <Button variant={pathname === '/agency' ? 'default' : 'ghost'} size="sm">
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Agency
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button variant={pathname === '/dashboard' ? 'default' : 'ghost'} size="sm">
                    <Users className="h-4 w-4 mr-2" />
                    Clients
                  </Button>
                </Link>
                <Link href="/library">
                  <Button variant={pathname === '/library' ? 'default' : 'ghost'} size="sm">
                    <Library className="h-4 w-4 mr-2" />
                    Library
                  </Button>
                </Link>
                <Link href="/agents">
                  <Button variant={pathname === '/agents' ? 'default' : 'ghost'} size="sm">
                    <Bot className="h-4 w-4 mr-2" />
                    Agents
                  </Button>
                </Link>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            {mounted && (
              <>
                {user ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setTourOpen(true)}
                      aria-label="Product tour"
                      title="Product tour"
                    >
                      <HelpCircle className="h-4 w-4" style={{ color: '#1C1917' }} />
                    </Button>
                    <Link href="/settings">
                      <Button variant={pathname === '/settings' ? 'default' : 'ghost'} size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        Settings
                      </Button>
                    </Link>
                    <Button onClick={handleLogout} variant="ghost" size="sm">
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign out
                    </Button>
                  </>
                ) : (
                  <Link href="/auth/signup">
                    <Button
                      size="sm"
                      className="rounded-full text-white border-0"
                      style={{ background: 'linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 100%)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #172554 0%, #1E40AF 100%)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 100%)'; }}
                    >
                      Get started free
                    </Button>
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      </nav>
      <ProductTourSpotlight open={tourOpen} onOpenChange={setTourOpen} />
    </div>
  );
}

