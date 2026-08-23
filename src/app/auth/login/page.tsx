'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { TurnstileWidget } from '@/components/auth/turnstile-widget';

const CAPTCHA_REQUIRED = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (CAPTCHA_REQUIRED && !captchaToken) {
      setError('Please complete the verification check');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
        ...(captchaToken ? { options: { captchaToken } } : {}),
      });

      if (error) throw error;

      if (data.session) {
        window.location.href = '/';
      }
    } catch (error: any) {
      setError(error.message || 'Failed to login');
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };

  const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" style={{ background: '#F5F3EF', ...pageFont }}>
      <Card className="w-full max-w-md" style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', borderRadius: 18, boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)' }}>
        <CardHeader>
          <CardTitle className="text-2xl font-extrabold text-center" style={{ color: '#1C1917', ...pageFont }}>
            Sign in to Plan Check
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="px-4 py-3 rounded" style={{ background: '#F5EDE9', border: '0.5px solid rgba(160,68,42,0.25)', color: '#A0442A', borderRadius: 10 }}>
                {error}
              </div>
            )}

            <div>
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <TurnstileWidget onVerify={setCaptchaToken} />

            <Button
              type="submit"
              disabled={loading || (CAPTCHA_REQUIRED && !captchaToken)}
              className="w-full"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>

            <div className="text-center text-sm">
              <span style={{ color: '#8A8578' }}>Don't have an account? </span>
              <Link href="/auth/signup" style={{ color: '#4A6580', fontWeight: 500 }}>
                Sign up
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

