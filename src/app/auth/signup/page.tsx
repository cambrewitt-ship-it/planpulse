'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SignupForm } from '@/components/auth/signup-form';

export default function SignupPage() {
  const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" style={{ background: '#F5F3EF', ...pageFont }}>
      <Card className="w-full max-w-md" style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', borderRadius: 18, boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)' }}>
        <CardHeader>
          <CardTitle className="text-2xl font-extrabold text-center" style={{ color: '#1C1917', ...pageFont }}>
            Create your account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SignupForm redirectTo="/agency" />
        </CardContent>
      </Card>
    </div>
  );
}
