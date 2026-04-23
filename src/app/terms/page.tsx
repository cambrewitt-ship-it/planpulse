import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — PlanPulse',
  description: 'Terms of Service for PlanPulse by OneOneThree Digital Ltd',
};

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p className="text-sm mb-10" style={{ color: '#8A8578' }}>
          Last updated: 22 April 2026
        </p>

        <div className="space-y-8" style={{ color: '#1C1917' }}>
          <section>
            <p className="leading-relaxed" style={{ color: '#44403C' }}>
              These Terms of Service ("Terms") govern your access to and use of PlanPulse, a software-as-a-service product operated by <strong>OneOneThree Digital Ltd</strong> ("we", "us", or "our"), owned by Cameron Brewitt. By creating an account or using PlanPulse, you agree to be bound by these Terms. If you do not agree, do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>1. The Service</h2>
            <p className="leading-relaxed" style={{ color: '#44403C' }}>
              PlanPulse is a web-based platform that helps marketing agencies manage client campaigns, media plans, and performance reporting. We reserve the right to modify, suspend, or discontinue the service (or any part of it) at any time, with reasonable notice where practicable.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>2. Accounts</h2>
            <ul className="list-disc pl-6 space-y-2" style={{ color: '#44403C' }}>
              <li>You must be at least 18 years old and legally capable of entering into a binding contract to create an account.</li>
              <li>You are responsible for maintaining the security of your account credentials and for all activity that occurs under your account.</li>
              <li>You must notify us immediately at <a href="mailto:cam@oneonethree.co.nz" className="underline" style={{ color: '#4A6580' }}>cam@oneonethree.co.nz</a> if you become aware of any unauthorised use of your account.</li>
              <li>You may not share your account with others or create accounts on behalf of third parties without our prior written consent.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>3. Subscriptions and Payment</h2>
            <ul className="list-disc pl-6 space-y-2" style={{ color: '#44403C' }}>
              <li>PlanPulse is offered on a subscription basis. Subscription fees, billing cycles, and plan details are displayed at the time of purchase.</li>
              <li>All fees are in New Zealand Dollars (NZD) unless otherwise stated and are exclusive of GST where applicable.</li>
              <li>Subscriptions renew automatically at the end of each billing period unless you cancel before the renewal date.</li>
              <li>We do not offer refunds for partial periods, except where required by New Zealand consumer law.</li>
              <li>We may change subscription pricing with at least 30 days' written notice. Continued use after the price change takes effect constitutes acceptance of the new pricing.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>4. Acceptable Use</h2>
            <p className="leading-relaxed mb-3" style={{ color: '#44403C' }}>
              You agree not to use PlanPulse to:
            </p>
            <ul className="list-disc pl-6 space-y-2" style={{ color: '#44403C' }}>
              <li>Violate any applicable law or regulation.</li>
              <li>Infringe the intellectual property rights of others.</li>
              <li>Upload or transmit malicious code, viruses, or disruptive software.</li>
              <li>Attempt to gain unauthorised access to any part of the service or its infrastructure.</li>
              <li>Use automated scripts to scrape, crawl, or extract data from the service without our prior written consent.</li>
              <li>Resell or sublicense access to PlanPulse without our prior written consent.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>5. Your Data</h2>
            <p className="leading-relaxed" style={{ color: '#44403C' }}>
              You retain ownership of all data you input into PlanPulse ("Your Data"). By using the service, you grant us a limited, non-exclusive licence to host, store, and process Your Data solely as necessary to provide the service. We will not access Your Data except to provide and maintain the service, comply with legal obligations, or as you direct us to. See our{' '}
              <Link href="/privacy" className="underline" style={{ color: '#4A6580' }}>
                Privacy Policy
              </Link>{' '}
              for further details.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>6. Intellectual Property</h2>
            <p className="leading-relaxed" style={{ color: '#44403C' }}>
              PlanPulse and all related software, design, text, graphics, logos, and other content are the property of OneOneThree Digital Ltd or its licensors and are protected by intellectual property laws. Nothing in these Terms transfers any ownership rights in PlanPulse to you. You are granted a limited, non-exclusive, non-transferable licence to use the service for your internal business purposes during your subscription term.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>7. Confidentiality</h2>
            <p className="leading-relaxed" style={{ color: '#44403C' }}>
              Each party agrees to keep the other's confidential information (including, in your case, any non-public features or pricing, and in our case, Your Data) confidential and not to disclose it to third parties without prior written consent, except as required by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>8. Disclaimer of Warranties</h2>
            <p className="leading-relaxed" style={{ color: '#44403C' }}>
              PlanPulse is provided "as is" and "as available" without warranties of any kind, either express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not warrant that the service will be uninterrupted, error-free, or completely secure. To the extent permitted by the New Zealand Consumer Guarantees Act 1993 and the Fair Trading Act 1986, all implied warranties are excluded for business use.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>9. Limitation of Liability</h2>
            <p className="leading-relaxed" style={{ color: '#44403C' }}>
              To the maximum extent permitted by applicable New Zealand law, OneOneThree Digital Ltd and its officers, employees, and contractors will not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits, revenue, data, or goodwill, arising out of or in connection with your use of PlanPulse. Our total aggregate liability to you for any claim arising under these Terms will not exceed the total fees paid by you in the three (3) months preceding the event giving rise to the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>10. Indemnification</h2>
            <p className="leading-relaxed" style={{ color: '#44403C' }}>
              You agree to indemnify and hold harmless OneOneThree Digital Ltd, its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of or in any way connected with your violation of these Terms or applicable law, or your use of PlanPulse.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>11. Termination</h2>
            <p className="leading-relaxed" style={{ color: '#44403C' }}>
              You may cancel your subscription at any time from your account settings. Cancellation takes effect at the end of the current billing period. We may suspend or terminate your account immediately if you breach these Terms, fail to pay fees when due, or if we are required to do so by law. Upon termination, your right to access PlanPulse ceases. We will retain Your Data for 90 days after termination, after which it will be deleted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>12. Governing Law and Disputes</h2>
            <p className="leading-relaxed" style={{ color: '#44403C' }}>
              These Terms are governed by the laws of New Zealand. Any dispute arising under or in connection with these Terms will be subject to the exclusive jurisdiction of the courts of New Zealand. We encourage you to contact us first at <a href="mailto:cam@oneonethree.co.nz" className="underline" style={{ color: '#4A6580' }}>cam@oneonethree.co.nz</a> before initiating any legal proceedings, so we have an opportunity to resolve the issue informally.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>13. Changes to These Terms</h2>
            <p className="leading-relaxed" style={{ color: '#44403C' }}>
              We may update these Terms from time to time. We will notify you of material changes by email or by posting a notice within PlanPulse at least 14 days before the changes take effect. Continued use of the service after that date constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>14. Contact</h2>
            <p className="leading-relaxed" style={{ color: '#44403C' }}>
              Questions about these Terms? Contact us at:
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
            <Link href="/privacy" className="underline" style={{ color: '#4A6580' }}>
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
