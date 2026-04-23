'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { LayoutDashboard, Users, LogOut, Library, Settings } from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);

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

  return (
    <nav className="border-b" style={{ background: '#FDFCF8', borderBottom: '0.5px solid #E8E4DC' }}>
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-bold" style={{ color: '#1C1917', fontFamily: "'DM Serif Display', Georgia, serif", letterSpacing: '-0.02em' }}>
              PlanPulse
            </Link>
            
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
            </div>
          </div>

          <div className="flex items-center gap-4">
            {mounted && (
              <>
                {user ? (
                  <>
                    <Link href="/settings">
                      <Button variant={pathname === '/settings' ? 'default' : 'ghost'} size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        Settings
                      </Button>
                    </Link>
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
    </nav>
  );
}

