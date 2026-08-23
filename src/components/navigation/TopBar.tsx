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

  return (
    <nav className="border-b" style={{ background: '#FDFCF8', borderBottom: '0.5px solid #E8E4DC' }}>
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-bold" style={{ color: '#1C1917', fontFamily: "'DM Serif Display', Georgia, serif", letterSpacing: '-0.02em' }}>
              PlanPulse
            </Link>
            
            {mounted && !user && (
              <div className="flex items-center gap-4">
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
              </div>
            )}

            {mounted && user && (
              <div className="flex items-center gap-4">
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
                  <Link href="/auth/login">
                    <Button size="sm">
                      Sign in
                    </Button>
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <ProductTourSpotlight open={tourOpen} onOpenChange={setTourOpen} />
    </nav>
  );
}

