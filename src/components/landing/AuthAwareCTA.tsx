'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { ArrowRight } from 'lucide-react';

// Extracted so the homepage (`src/app/page.tsx`) can be a Server Component
// and export `metadata` — Next.js ignores metadata exports from 'use client'
// files, and the only client-only bit of the homepage was this signed-in check.
export function AuthAwareCTA({
  children,
  size = 'lg',
  variant,
  className,
}: {
  children: React.ReactNode;
  size?: 'default' | 'sm' | 'lg' | 'icon-sm';
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
}) {
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsSignedIn(!!session?.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  const href = isSignedIn ? '/agency' : '/auth/signup';

  return (
    <Link href={href}>
      <Button size={size} variant={variant} className={className}>
        {children}
        <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
      </Button>
    </Link>
  );
}
