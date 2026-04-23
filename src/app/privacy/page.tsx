import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — PlanPulse',
  description: 'Privacy Policy for PlanPulse by OneOneThree Digital Ltd',
};

export default function PrivacyPage() {
  const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };
  const serifFont: React.CSSProperties = { fontFamily: "'DM Serif Display', Georgia, serif" };

  return (
    <div className="min-h-screen" style={{ background: '#F5F3EF', ...pageFont }}>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <div className="mb-10">
          <Link href="/" className="text-sm" style={{ color: '#8A8578' }}>
            ← Back to PlanPulse
          </Link>
        </div>

        <h1 className="text-4xl font-bold mb-2" style={{ color: '#1C1917', ...serifFont }}>
          Privacy Policy
        </h1>
        <p className="text-sm mb-10" style={{ color: '#8A8578' }}>
          Last updated: 22 April 2026
        </p>

        <div className="space-y-8" style={{ color: '#1C1917' }}>
          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>1. Who We Are</h2>
            <p className="leading-relaxed" style={{ color: '#44403C' }}>
              PlanPulse is a software-as-a-service product operated by <strong>OneOneThree Digital Ltd</strong> (company registration New Zealand), owned by Cameron Brewitt. Our contact email is{' '}
              <a href="mailto:cam@oneonethree.co.nz" className="underline" style={{ color: '#4A6580' }}>
                cam@oneonethree.co.nz
              </a>
              . This Privacy Policy explains how we collect, use, store, and share your personal information when you use PlanPulse.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>2. Information We Collect</h2>
            <p className="leading-relaxed mb-3" style={{ color: '#44403C' }}>
              We collect information you provide directly to us, and information generated through your use of PlanPulse:
            </p>
            <ul className="list-disc pl-6 space-y-2" style={{ color: '#44403C' }}>
              <li><strong>Account information:</strong> name, email address, password (hashed), and company/agency name.</li>
              <li><strong>Billing information:</strong> payment method details processed by our third-party payment provider (we do not store full card numbers).</li>
              <li><strong>Usage data:</strong> pages visited, features used, timestamps, and browser/device information collected via cookies and analytics tools.</li>
              <li><strong>Client and campaign data:</strong> any client names, media plans, budgets, or campaign information you enter into PlanPulse.</li>
              <li><strong>Communications:</strong> any messages you send us via email or support channels.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>3. How We Use Your Information</h2>
            <p className="leading-relaxed mb-3" style={{ color: '#44403C' }}>We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-2" style={{ color: '#44403C' }}>
              <li>Provide, operate, and improve the PlanPulse service.</li>
              <li>Process payments and manage your subscription.</li>
              <li>Send transactional emails (account confirmations, invoices, password resets).</li>
              <li>Send product updates and marketing communications (you may unsubscribe at any time).</li>
              <li>Respond to support requests and enquiries.</li>
              <li>Monitor and analyse usage patterns to improve performance and user experience.</li>
              <li>Comply with legal obligations under New Zealand law, including the Privacy Act 2020.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>4. Cookies and Tracking</h2>
            <p className="leading-relaxed" style={{ color: '#44403C' }}>
              PlanPulse uses cookies and similar technologies to keep you logged in, remember your preferences, and understand how you use the product. We may use third-party analytics services (such as Vercel Analytics or similar). You can disable cookies in your browser settings; however, some features of PlanPulse may not function correctly without them.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>5. Sharing Your Information</h2>
            <p className="leading-relaxed mb-3" style={{ color: '#44403C' }}>
              We do not sell your personal information. We may share your information with:
            </p>
            <ul className="list-disc pl-6 space-y-2" style={{ color: '#44403C' }}>
              <li><strong>Service providers:</strong> third-party vendors who help us operate PlanPulse (hosting, payments, email delivery). These providers are bound by confidentiality obligations.</li>
              <li><strong>Legal requirements:</strong> where disclosure is required by law, regulation, or a court order in New Zealand or another applicable jurisdiction.</li>
              <li><strong>Business transfers:</strong> in the event of a merger, acquisition, or sale of OneOneThree Digital Ltd, your information may transfer to the acquiring entity.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>6. Data Retention</h2>
            <p className="leading-relaxed" style={{ color: '#44403C' }}>
              We retain your account data for as long as your subscription is active. After account closure we retain data for up to 90 days to allow for account recovery, after which it is deleted or anonymised, unless a longer retention period is required by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>7. Security</h2>
            <p className="leading-relaxed" style={{ color: '#44403C' }}>
              We use industry-standard measures including encryption in transit (TLS) and at rest, access controls, and regular security reviews to protect your information. No method of transmission over the internet is completely secure, however, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>8. Your Rights (New Zealand Privacy Act 2020)</h2>
            <p className="leading-relaxed mb-3" style={{ color: '#44403C' }}>
              Under the New Zealand Privacy Act 2020 you have the right to:
            </p>
            <ul className="list-disc pl-6 space-y-2" style={{ color: '#44403C' }}>
              <li>Request access to the personal information we hold about you.</li>
              <li>Request correction of any inaccurate personal information.</li>
              <li>Request deletion of your personal information (subject to legal retention obligations).</li>
              <li>Lodge a complaint with the Office of the Privacy Commissioner if you believe your privacy rights have been breached.</li>
            </ul>
            <p className="leading-relaxed mt-3" style={{ color: '#44403C' }}>
              To exercise any of these rights, contact us at{' '}
              <a href="mailto:cam@oneonethree.co.nz" className="underline" style={{ color: '#4A6580' }}>
                cam@oneonethree.co.nz
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>9. International Transfers</h2>
            <p className="leading-relaxed" style={{ color: '#44403C' }}>
              Your data may be processed or stored on servers located outside New Zealand (for example, in the United States or Europe) by our service providers. When this occurs, we take steps to ensure your information is protected to a standard comparable to the New Zealand Privacy Act 2020.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>10. Changes to This Policy</h2>
            <p className="leading-relaxed" style={{ color: '#44403C' }}>
              We may update this Privacy Policy from time to time. We will notify you of material changes by email or by posting a notice within PlanPulse. Continued use of the service after the effective date of any changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>11. Contact Us</h2>
            <p className="leading-relaxed" style={{ color: '#44403C' }}>
              For any privacy-related questions or requests, please contact:
            </p>
            <div className="mt-3 p-4 rounded-lg" style={{ background: '#FDFCF8', border: '0.5px solid #E8E4DC' }}>
              <p style={{ color: '#44403C' }}>
                <strong>Cameron Brewitt</strong><br />
                OneOneThree Digital Ltd<br />
                <a href="mailto:cam@oneonethree.co.nz" className="underline" style={{ color: '#4A6580' }}>
                  cam@oneonethree.co.nz
                </a>
              </p>
            </div>
          </section>
        </div>

        <div className="mt-16 pt-8" style={{ borderTop: '0.5px solid #E8E4DC', color: '#8A8578' }}>
          <p className="text-sm">
            Also see our{' '}
            <Link href="/terms" className="underline" style={{ color: '#4A6580' }}>
              Terms of Service
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
