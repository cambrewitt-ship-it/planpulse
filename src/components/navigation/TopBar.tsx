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
import { ChevronDown, LayoutDashboard, Users } from 'lucide-react';

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

  useEffect(() => {
    setMounted(true);
    loadClients();
  }, []);

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

  return (
    <nav className="border-b bg-white">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-bold">
              Marketing Dashboard
            </Link>
            
            <div className="flex items-center gap-4">
              <Link href="/plans">
                <Button variant={pathname === '/plans' ? 'default' : 'ghost'} size="sm">
                  Plans
                </Button>
              </Link>
              <Link href="/clients">
                <Button variant={pathname === '/clients' ? 'default' : 'ghost'} size="sm">
                  <Users className="h-4 w-4 mr-2" />
                  Clients
                </Button>
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {mounted && (
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
          </div>
        </div>
      </div>
    </nav>
  );
}

