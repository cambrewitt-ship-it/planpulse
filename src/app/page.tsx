// src/app/page.tsx
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
  Sparkles,
  ArrowRight
} from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-primary/5">
          <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
          <div className="container mx-auto px-4 py-24 md:py-32">
            <div className="max-w-4xl mx-auto text-center space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                <Sparkles className="w-4 h-4" />
                Streamline Your Marketing Operations
              </div>
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent mb-12 pb-1">
                Your Campaign Manager
              </h1>
              <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                The all-in-one platform to manage client campaigns, media plans, and action points. 
                Take control of your marketing strategy with powerful tools designed for efficiency.
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
        <section className="py-24 bg-background">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Everything You Need to Manage Campaigns
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Powerful features that help you stay organized, track progress, and deliver results
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {/* Feature 1 */}
              <div className="p-6 rounded-xl border bg-card hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Client Management</h3>
                <p className="text-muted-foreground">
                  Organize all your clients in one place. Create, track, and manage client relationships with ease.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="p-6 rounded-xl border bg-card hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Target className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Media Planning</h3>
                <p className="text-muted-foreground">
                  Build comprehensive media plans with channel libraries. Plan and execute campaigns across multiple platforms.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="p-6 rounded-xl border bg-card hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Action Points</h3>
                <p className="text-muted-foreground">
                  Track action items and tasks by channel type. Never miss a deadline with organized task management.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="p-6 rounded-xl border bg-card hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <BarChart3 className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Analytics & Insights</h3>
                <p className="text-muted-foreground">
                  Monitor campaign performance with detailed dashboards and real-time analytics.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="p-6 rounded-xl border bg-card hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Calendar className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Timeline Management</h3>
                <p className="text-muted-foreground">
                  Keep track of campaign timelines, deadlines, and milestones all in one centralized location.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="p-6 rounded-xl border bg-card hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <TrendingUp className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Growth Tracking</h3>
                <p className="text-muted-foreground">
                  Measure success and identify opportunities for improvement with comprehensive reporting tools.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 bg-gradient-to-r from-primary/10 to-primary/5">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center space-y-6">
              <h2 className="text-3xl md:text-4xl font-bold">
                Ready to Transform Your Campaign Management?
              </h2>
              <p className="text-lg text-muted-foreground">
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