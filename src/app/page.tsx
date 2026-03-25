// src/app/page.tsx
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Footer from '@/components/Footer';
import { 
  Target, 
  Users, 
  BarChart3, 
  Calendar, 
  CheckCircle2, 
  TrendingUp,
  ArrowRight
} from 'lucide-react';

export default function Home() {
  const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };
  const serifFont: React.CSSProperties = { fontFamily: "'DM Serif Display', Georgia, serif" };
  
  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#F5F3EF', ...pageFont }}>
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden" style={{ background: '#F5F3EF' }}>
          <div className="container mx-auto px-4 py-24 md:py-32">
            <div className="max-w-4xl mx-auto text-center space-y-6">
              <h1 className="text-5xl md:text-6xl font-bold leading-none" style={{ color: '#1C1917', ...serifFont, letterSpacing: '-0.02em' }}>
                PlanPulse
              </h1>
              <p className="text-4xl md:text-6xl font-black leading-tight max-w-3xl mx-auto" style={{ color: '#1C1917', letterSpacing: '-0.02em' }}>
                Health check software for marketing agencies
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-6">
                <Link href="/dashboard">
                  <Button size="lg" className="text-lg px-8 py-6 h-auto group">
                    Get Started
                    <ArrowRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                <Link href="/plans">
                  <Button size="lg" variant="outline" className="text-lg px-8 py-6 h-auto">
                    View Plans
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24" style={{ background: '#FDFCF8' }}>
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#1C1917', ...serifFont }}>
                Everything You Need to Manage Campaigns
              </h2>
              <p className="text-lg max-w-2xl mx-auto" style={{ color: '#8A8578' }}>
                Powerful features that help you stay organized, track progress, and deliver results
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {/* Feature 1 */}
              <div className="p-6 rounded-lg transition-shadow" style={{ background: '#FDFCF8', border: '0.5px solid #E8E4DC', borderRadius: 6 }}>
                <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style={{ background: '#E8EDF2' }}>
                  <Users className="w-6 h-6" style={{ color: '#4A6580' }} />
                </div>
                <h3 className="text-xl font-semibold mb-2" style={{ color: '#1C1917' }}>Client Management</h3>
                <p style={{ color: '#8A8578' }}>
                  Organize all your clients in one place. Create, track, and manage client relationships with ease.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="p-6 rounded-lg transition-shadow" style={{ background: '#FDFCF8', border: '0.5px solid #E8E4DC', borderRadius: 6 }}>
                <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style={{ background: '#E8EDF2' }}>
                  <Target className="w-6 h-6" style={{ color: '#4A6580' }} />
                </div>
                <h3 className="text-xl font-semibold mb-2" style={{ color: '#1C1917' }}>Media Planning</h3>
                <p style={{ color: '#8A8578' }}>
                  Build comprehensive media plans with channel libraries. Plan and execute campaigns across multiple platforms.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="p-6 rounded-lg transition-shadow" style={{ background: '#FDFCF8', border: '0.5px solid #E8E4DC', borderRadius: 6 }}>
                <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style={{ background: '#EAF0EB' }}>
                  <CheckCircle2 className="w-6 h-6" style={{ color: '#4A7C59' }} />
                </div>
                <h3 className="text-xl font-semibold mb-2" style={{ color: '#1C1917' }}>Action Points</h3>
                <p style={{ color: '#8A8578' }}>
                  Track action items and tasks by channel type. Never miss a deadline with organized task management.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="p-6 rounded-lg transition-shadow" style={{ background: '#FDFCF8', border: '0.5px solid #E8E4DC', borderRadius: 6 }}>
                <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style={{ background: '#E8EDF2' }}>
                  <BarChart3 className="w-6 h-6" style={{ color: '#4A6580' }} />
                </div>
                <h3 className="text-xl font-semibold mb-2" style={{ color: '#1C1917' }}>Analytics & Insights</h3>
                <p style={{ color: '#8A8578' }}>
                  Monitor campaign performance with detailed dashboards and real-time analytics.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="p-6 rounded-lg transition-shadow" style={{ background: '#FDFCF8', border: '0.5px solid #E8E4DC', borderRadius: 6 }}>
                <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style={{ background: '#E8EDF2' }}>
                  <Calendar className="w-6 h-6" style={{ color: '#4A6580' }} />
                </div>
                <h3 className="text-xl font-semibold mb-2" style={{ color: '#1C1917' }}>Timeline Management</h3>
                <p style={{ color: '#8A8578' }}>
                  Keep track of campaign timelines, deadlines, and milestones all in one centralized location.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="p-6 rounded-lg transition-shadow" style={{ background: '#FDFCF8', border: '0.5px solid #E8E4DC', borderRadius: 6 }}>
                <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style={{ background: '#EAF0EB' }}>
                  <TrendingUp className="w-6 h-6" style={{ color: '#4A7C59' }} />
                </div>
                <h3 className="text-xl font-semibold mb-2" style={{ color: '#1C1917' }}>Growth Tracking</h3>
                <p style={{ color: '#8A8578' }}>
                  Measure success and identify opportunities for improvement with comprehensive reporting tools.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24" style={{ background: '#F5F3EF' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center space-y-6">
              <h2 className="text-3xl md:text-4xl font-bold" style={{ color: '#1C1917', ...serifFont }}>
                Ready to Transform Your Campaign Management?
              </h2>
              <p className="text-lg" style={{ color: '#8A8578' }}>
                Join teams who are already streamlining their marketing operations with Your Campaign Manager.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
                <Link href="/dashboard">
                  <Button size="lg" className="text-lg px-8 py-6 h-auto">
                    Start Managing Campaigns
                  </Button>
                </Link>
                <Link href="/clients/create">
                  <Button size="lg" variant="outline" className="text-lg px-8 py-6 h-auto">
                    Create Your First Client
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}