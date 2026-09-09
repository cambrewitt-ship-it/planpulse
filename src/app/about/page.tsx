import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import Footer from '@/components/Footer';
import { Reveal } from '@/components/landing/Reveal';
import { ArrowRight, Mail, Clock, CalendarClock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About Us — PlanPulse',
  description: 'PlanPulse is built by OneOneThree Digital, a New Zealand marketing agency.',
};

const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };
const serifFont: React.CSSProperties = { fontFamily: "'DM Serif Display', Georgia, serif" };

export default function AboutPage() {
  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#F5F3EF', ...pageFont }}>
      <main className="flex-1">
        <section className="relative py-24 md:py-28" style={{ background: '#F5F3EF' }}>
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 left-0 w-[280px] sm:w-[420px] h-[280px] sm:h-[420px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(74,124,89,0.16) 0%, rgba(74,124,89,0) 70%)', filter: 'blur(20px)' }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 right-0 w-[300px] sm:w-[480px] h-[300px] sm:h-[480px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(74,101,128,0.14) 0%, rgba(74,101,128,0) 70%)', filter: 'blur(20px)' }}
          />
          <div className="container relative mx-auto px-4">
            <Reveal className="max-w-2xl mx-auto text-center space-y-6">
              <span
                className="inline-block text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
                style={{ background: '#E8EDF2', color: '#4A6580' }}
              >
                About Us
              </span>
              <div className="flex items-center justify-center gap-10 flex-wrap">
                <h1 className="text-4xl md:text-6xl font-bold leading-tight" style={{ color: '#1C1917', ...serifFont, letterSpacing: '-0.02em' }}>
                  PlanPulse
                </h1>
                <a
                  href="https://www.oneonethree.co.nz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center transition-transform hover:-translate-y-0.5"
                >
                  <Image
                    src="/oot-product-silver.png"
                    alt="A product by OneOneThree Digital"
                    width={625}
                    height={209}
                    className="h-10 md:h-14 w-auto"
                  />
                </a>
              </div>
              <h2
                className="text-2xl md:text-4xl"
                style={{
                  color: '#1C1917',
                  ...pageFont,
                  fontWeight: 900,
                  letterSpacing: '-0.03em',
                  lineHeight: 0.95,
                }}
              >
                Built for agencies, by an agency.
              </h2>
              <div className="space-y-4 text-lg leading-relaxed" style={{ color: '#57534E' }}>
                <p>
                  PlanPulse is a product by OneOneThree Digital — we are a New Zealand based company offering
                  marketing products and services.
                </p>
                <p>
                  After years of running digital marketing for clients, we got tired of stitching together
                  spreadsheets to know if a client campaign was ticking — so we built PlanPulse to do it for
                  us, open to any agency operator battling the same fight.
                </p>
              </div>
              <p className="text-sm font-medium pt-2" style={{ color: '#8A8578' }}>
                Click below to see more OneOneThree Digital marketing products &amp; services
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
                <Link href="/auth/signup">
                  <Button size="lg" className="text-base px-8 py-4 h-auto group">
                    Get started free
                    <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                <a href="https://www.oneonethree.co.nz" target="_blank" rel="noopener noreferrer">
                  <Button size="lg" variant="outline" className="text-base px-8 py-4 h-auto">
                    Discover our other marketing products
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </a>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Contact */}
        <section className="py-20" style={{ background: '#FDFCF8' }}>
          <div className="container mx-auto px-4">
            <Reveal className="max-w-2xl mx-auto text-center space-y-4 mb-12">
              <h2
                className="text-3xl md:text-4xl"
                style={{ color: '#1C1917', ...pageFont, fontWeight: 900, letterSpacing: '-0.03em' }}
              >
                Contact Us
              </h2>
              <p className="text-base leading-relaxed" style={{ color: '#8A8578' }}>
                Have a question or need help? We&apos;d love to hear from you. Get in touch and we&apos;ll
                respond as soon as possible.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <div
                className="max-w-3xl mx-auto rounded-[24px] p-8 md:p-10"
                style={{
                  background: '#F5F3EF',
                  border: '1px solid rgba(232,228,220,0.7)',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)',
                }}
              >
                <h3 className="text-xl font-semibold mb-1 text-center" style={{ color: '#1C1917' }}>
                  Get in Touch
                </h3>
                <p className="text-sm text-center mb-8" style={{ color: '#8A8578' }}>
                  We&apos;re here to help with any questions you may have.
                </p>
                <div className="grid sm:grid-cols-3 gap-8">
                  <div className="text-center space-y-2">
                    <div className="w-11 h-11 rounded-lg flex items-center justify-center mx-auto" style={{ background: '#E8EDF2' }}>
                      <Mail className="w-5 h-5" style={{ color: '#4A6580' }} />
                    </div>
                    <div className="text-sm font-semibold" style={{ color: '#1C1917' }}>Email</div>
                    <a
                      href="mailto:cam@oneonethree.co.nz"
                      className="block text-sm underline underline-offset-4"
                      style={{ color: '#4A6580' }}
                    >
                      cam@oneonethree.co.nz
                    </a>
                  </div>
                  <div className="text-center space-y-2">
                    <div className="w-11 h-11 rounded-lg flex items-center justify-center mx-auto" style={{ background: '#EAF0EB' }}>
                      <Clock className="w-5 h-5" style={{ color: '#4A7C59' }} />
                    </div>
                    <div className="text-sm font-semibold" style={{ color: '#1C1917' }}>Response Time</div>
                    <div className="text-sm" style={{ color: '#57534E' }}>We typically respond within 24 hours</div>
                  </div>
                  <div className="text-center space-y-2">
                    <div className="w-11 h-11 rounded-lg flex items-center justify-center mx-auto" style={{ background: '#E8EDF2' }}>
                      <CalendarClock className="w-5 h-5" style={{ color: '#4A6580' }} />
                    </div>
                    <div className="text-sm font-semibold" style={{ color: '#1C1917' }}>Support Hours</div>
                    <div className="text-sm" style={{ color: '#57534E' }}>Monday – Friday, 9 AM – 5 PM</div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* CTA */}
        <section className="pb-24 pt-4" style={{ background: '#F5F3EF' }}>
          <div className="container mx-auto px-4">
            <Reveal>
              <div
                className="relative max-w-6xl mx-auto overflow-hidden text-center space-y-6 px-8 py-20 md:py-24"
                style={{
                  borderRadius: 32,
                  background: 'radial-gradient(120% 160% at 15% 15%, #3E6A4E 0%, #1C1917 45%, #1C1917 55%, #2D4A61 100%)',
                  boxShadow: '0 24px 64px rgba(28,25,23,0.28)',
                }}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute -bottom-24 -right-16 w-[380px] h-[380px] rounded-full"
                  style={{ background: 'radial-gradient(circle, rgba(74,101,128,0.35) 0%, rgba(74,101,128,0) 70%)', filter: 'blur(10px)' }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-20 -left-10 w-[300px] h-[300px] rounded-full"
                  style={{ background: 'radial-gradient(circle, rgba(74,124,89,0.35) 0%, rgba(74,124,89,0) 70%)', filter: 'blur(10px)' }}
                />
                <div className="relative max-w-2xl mx-auto space-y-6">
                  <h2
                    className="text-3xl md:text-4xl font-bold"
                    style={{ color: '#F5F3EF', ...pageFont }}
                  >
                    Stop stitching spreadsheets together
                  </h2>
                  <p className="text-base" style={{ color: '#D5D0C5' }}>
                    Start free. Upgrade as your client roster grows. No credit card required.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                    <Link href="/auth/signup">
                      <Button size="lg" className="text-base px-8 py-4 h-auto rounded-full bg-white text-stone-900 hover:bg-stone-100 group shadow-lg">
                        Get started free
                        <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                      </Button>
                    </Link>
                    <Link href="/pricing">
                      <Button size="lg" variant="outline" className="text-base px-8 py-4 h-auto rounded-full border-stone-500 text-stone-100 bg-transparent hover:bg-white/10 hover:text-white">
                        View pricing
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
