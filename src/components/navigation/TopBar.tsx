'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getClients } from '@/lib/db/plans';
import { supabase } from '@/lib/supabase/client';
import { ChevronDown, LayoutDashboard, Users, LogOut, User, Library } from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface Client {
  id: string;
  name: string;
}

export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);

  useEffect(() => {
    setMounted(true);
    loadClients();
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

  const loadClients = async () => {
    try {
      const data = await getClients();
      setClients(data || []);
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClientSelect = (clientId: string) => {
    router.push(`/clients/${clientId}/dashboard`);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  };

  return (
    <nav className="border-b bg-white">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-bold">
              Marketing Dashboard
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
                {user && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" disabled={loading || clients.length === 0}>
                        <LayoutDashboard className="h-4 w-4 mr-2" />
                        Client Dashboard
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Select Client</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {loading ? (
                        <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
                      ) : clients.length === 0 ? (
                        <DropdownMenuItem disabled>No clients found</DropdownMenuItem>
                      ) : (
                        clients.map((client) => (
                          <DropdownMenuItem
                            key={client.id}
                            onClick={() => handleClientSelect(client.id)}
                          >
                            {client.name}
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {user ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <User className="h-4 w-4 mr-2" />
                        {user.email}
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Account</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleLogout}>
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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

