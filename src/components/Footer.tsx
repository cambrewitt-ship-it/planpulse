'use client';

import Link from 'next/link';
import { Linkedin } from 'lucide-react';

const columnHeaderStyle: React.CSSProperties = {
  color: '#78716C',
  letterSpacing: '0.12em',
};

const linkStyle: React.CSSProperties = { color: '#44403C' };

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-bold uppercase" style={columnHeaderStyle}>
        {title}
      </span>
      {links.map((link) =>
        link.external ? (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm transition-colors hover:opacity-70"
            style={linkStyle}
          >
            {link.label}
          </a>
        ) : (
          <Link
            key={link.href}
            href={link.href}
            className="text-sm transition-colors hover:opacity-70"
            style={linkStyle}
          >
            {link.label}
          </Link>
        )
      )}
    </div>
  );
}

export default function Footer() {
  return (
    <footer className="mt-auto" style={{ background: '#F5F3EF' }}>
      <div className="container mx-auto px-4 py-14">
        <div className="flex flex-col md:flex-row md:justify-between gap-12">
          <div className="max-w-xs">
            <Link
              href="/"
              className="text-2xl font-bold"
              style={{ color: '#1C1917', fontFamily: "'DM Serif Display', Georgia, serif", letterSpacing: '-0.02em' }}
            >
              PlanPulse
            </Link>
            <p className="mt-3 text-xl font-semibold leading-snug" style={{ color: '#292524' }}>
              Agentic AI software for marketing agencies
            </p>
          </div>

          <div className="flex flex-wrap gap-x-16 gap-y-10">
            <FooterColumn
              title="Product"
              links={[
                { label: 'Features', href: '/features' },
                { label: 'Pricing', href: '/pricing' },
              ]}
            />
            <FooterColumn
              title="Resources"
              links={[
                { label: 'Blog', href: '/blog' },
                { label: 'Glossary', href: '/glossary' },
              ]}
            />
            <FooterColumn
              title="Company"
              links={[{ label: 'About', href: '/about' }]}
            />
            <FooterColumn
              title="Legal"
              links={[
                { label: 'Terms & conditions', href: '/terms' },
                { label: 'Privacy policy', href: '/privacy' },
              ]}
            />
            <FooterColumn
              title="OneOneThree Digital"
              links={[
                { label: 'Home', href: 'https://www.oneonethree.co.nz/', external: true },
                { label: 'About Us', href: 'https://www.oneonethree.co.nz/about', external: true },
                { label: 'Contact Us', href: 'https://www.oneonethree.co.nz/contact', external: true },
              ]}
            />
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(28,25,23,0.10)' }}>
        <div className="container mx-auto px-4 py-10 flex flex-col items-center gap-5">
          <img src="/oot-product-silver.png" alt="A product by OneOneThree Digital" className="h-11 w-auto" />
          <a
            href="https://nz.linkedin.com/company/oneonethreedigital"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="OneOneThree Digital on LinkedIn"
            className="flex items-center justify-center w-9 h-9 rounded-full transition-colors hover:opacity-80"
            style={{ background: '#1C1917' }}
          >
            <Linkedin className="w-4 h-4" style={{ color: '#F5F3EF' }} />
          </a>
          <div className="text-sm text-center" style={{ color: '#3F3A33' }}>
            © {new Date().getFullYear()} PlanPulse. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}
