'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { TurnstileWidget } from '@/components/auth/turnstile-widget';

const CAPTCHA_REQUIRED = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

interface Props {
  redirectTo?: string;
  className?: string;
}

export function SignupForm({ redirectTo = '/agency', className = '' }: Props) {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    if (CAPTCHA_REQUIRED && !captchaToken) {
      setError('Please complete the verification check');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { first_name: firstName.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${redirectTo}`,
          ...(captchaToken ? { captchaToken } : {}),
        },
      });

      if (error) throw error;

      // Check if email confirmation is required
      if (data.user && !data.session) {
        setSuccess(true);
        setError('Please check your email to confirm your account');
      } else if (data.session) {
        // Auto-signed in (email confirmation disabled) — go straight to the
        // destination, where the first-run product tour picks up from here.
        router.push(redirectTo);
        router.refresh();
      }
    } catch (error: any) {
      setError(error.message || 'Failed to sign up');
      console.error('Signup error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={`text-center space-y-4 ${className}`}>
        <div className="px-4 py-3 rounded" style={{ background: '#EAF0EB', border: '0.5px solid rgba(74,124,89,0.25)', color: '#4A7C59', borderRadius: 10 }}>
          Account created successfully! Please check your email to confirm your account.
        </div>
        <Link href="/auth/login">
          <Button className="w-full">
            Go to Login
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSignup} className={`space-y-6 ${className}`}>
      {error && (
        <div className="px-4 py-3 rounded" style={{
          background: error.includes('check your email') ? '#E8EDF2' : '#F5EDE9',
          border: error.includes('check your email') ? '0.5px solid rgba(74,101,128,0.25)' : '0.5px solid rgba(160,68,42,0.25)',
          color: error.includes('check your email') ? '#4A6580' : '#A0442A',
          borderRadius: 10
        }}>
          {error}
        </div>
      )}

      <div>
        <Label htmlFor="firstName">First name</Label>
        <Input
          id="firstName"
          type="text"
          required
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Jane"
          className="mt-1"
        />
      </div>

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
            minLength={6}
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
        <p className="text-xs mt-1" style={{ color: '#B5B0A5' }}>
          Must be at least 6 characters
        </p>
      </div>

      <div>
        <Label htmlFor="confirmPassword">Confirm Password</Label>
        <div className="relative mt-1">
          <Input
            id="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            className="pr-10"
            minLength={6}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
          >
            {showConfirmPassword ? (
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
        {loading ? 'Creating account...' : 'Sign up'}
      </Button>

      <p className="text-center text-xs" style={{ color: '#8A8578' }}>
        By clicking Sign Up, you agree to our{' '}
        <Link href="/terms" style={{ color: '#4A6580', fontWeight: 500 }}>
          Terms and Conditions
        </Link>
      </p>

      <div className="text-center text-sm">
        <span style={{ color: '#8A8578' }}>Already have an account? </span>
        <Link href="/auth/login" style={{ color: '#4A6580', fontWeight: 500 }}>
          Sign in
        </Link>
      </div>
    </form>
  );
}
