import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms and Conditions — PlanPulse',
  description: 'Terms and Conditions for PlanPulse by OneOneThree Digital Limited',
};

export default function TermsPage() {
  const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };
  const serifFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };
  const body: React.CSSProperties = { color: '#44403C' };
  const link: React.CSSProperties = { color: '#4A6580' };

  return (
    <div className="min-h-screen" style={{ background: '#F5F3EF', ...pageFont }}>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <div className="mb-10">
          <Link href="/" className="text-sm" style={{ color: '#8A8578' }}>
            ← Back to PlanPulse
          </Link>
        </div>

        <h1 className="text-4xl font-bold mb-2" style={{ color: '#1C1917', ...serifFont }}>
          Terms and Conditions
        </h1>
        <p className="text-sm mb-10" style={{ color: '#8A8578' }}>
          Last Updated: 22 August 2026
        </p>

        <div className="space-y-8" style={{ color: '#1C1917' }}>
          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>1. Agreement to Terms</h2>
            <p className="leading-relaxed mb-3" style={body}>
              By accessing or using PlanPulse ("the Service"), you agree to be bound by these Terms and Conditions. If you do not agree to these terms, you may not use the Service.
            </p>
            <p className="leading-relaxed mb-3" style={body}>
              The Service is operated by OneOneThree Digital Limited ("we", "us", or "our"), based in New Zealand.
            </p>
            <p className="leading-relaxed" style={body}>
              PlanPulse is currently in beta. Features, availability, and functionality may change without notice as the Service develops — see Section 5 for details on what this means for you.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>2. Description of Service</h2>
            <p className="leading-relaxed" style={body}>
              PlanPulse is an AI-native media planning and campaign health monitoring platform built for marketing agencies. The Service allows agencies to build media plans, track pacing against budget and performance goals, and monitor the health of campaigns running on connected advertising platforms. The Service operates on a Software-as-a-Service (SaaS) model.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>3. Eligibility and Account Registration</h2>

            <h3 className="font-semibold mb-2" style={serifFont}>3.1 Account Creation</h3>
            <p className="leading-relaxed mb-2" style={body}>To use the Service, you must:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4" style={body}>
              <li>Provide accurate and complete information (name, agency name, and email address)</li>
              <li>Maintain the security of your account credentials</li>
              <li>Be responsible for all activities that occur under your account</li>
              <li>Notify us immediately of any unauthorized access or security breach</li>
            </ul>

            <h3 className="font-semibold mb-2" style={serifFont}>3.2 Who This Service Is For</h3>
            <p className="leading-relaxed mb-4" style={body}>
              PlanPulse is designed for use by marketing agencies and the staff they authorise, managing media plans and connected ad accounts on behalf of their own clients. You must have the legal authority to act on behalf of your agency when creating an account.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>3.3 Client Portal Users</h3>
            <p className="leading-relaxed mb-2" style={body}>
              On plans that include the client portal feature, you may invite your own clients to a read-only portal view. You are solely responsible for:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-2" style={body}>
              <li>What data and clients you expose to a given client portal user</li>
              <li>Ensuring your agreement with that client permits you to share the relevant campaign and performance data with them through the Service</li>
              <li>Deactivating client portal access promptly when your relationship with that client ends</li>
            </ul>
            <p className="leading-relaxed mb-4" style={body}>
              We treat client portal users as invitees acting under your account. We are not responsible for any dispute between you and a client portal user, including disagreements about what data was or should have been visible to them.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>3.4 Account Security</h3>
            <p className="leading-relaxed" style={body}>
              You are solely responsible for maintaining the confidentiality of your account login information. You agree to notify us immediately if you become aware of any unauthorized use of your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>4. Subscription Plans and Pricing</h2>

            <h3 className="font-semibold mb-2" style={serifFont}>4.1 Pricing Tiers</h3>
            <p className="leading-relaxed mb-2" style={body}>
              The Service offers the following subscription plans, current details of which are available at{' '}
              <a href="https://www.planpulse.nz/pricing" className="underline" style={link}>planpulse.nz/pricing</a>:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-2" style={body}>
              <li><strong>Free:</strong> 1 client, core planning and health scoring features, no credit card required</li>
              <li><strong>Starter:</strong> $99 NZD/month — 5 clients, 2 users, Google Ads + Meta sync</li>
              <li><strong>Growth:</strong> $249 NZD/month — 15 clients, 5 users, GA4 integration, unlimited AI chat (action-taking)</li>
              <li><strong>Agency:</strong> $549 NZD/month — unlimited clients, 10 users, white-label reporting, client portal</li>
            </ul>
            <p className="leading-relaxed mb-4" style={body}>
              We reserve the right to introduce, modify, or retire plans, and to change what each tier includes, at any time.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>4.2 Payment Terms</h3>
            <ul className="list-disc pl-6 space-y-2 mb-4" style={body}>
              <li>All prices are in New Zealand Dollars (NZD) and exclude GST where applicable</li>
              <li>Payment is processed through Stripe, a third-party payment processor</li>
              <li>Subscriptions are billed monthly or annually, at your election; annual billing is paid upfront and is non-refundable except as set out in Section 6.2</li>
              <li>You authorize us to charge your payment method for all fees incurred</li>
              <li>Downgrading your plan may result in loss of access to data, clients, or users in excess of your new plan's limits; you are responsible for exporting or reassigning anything you need to keep before downgrading</li>
            </ul>

            <h3 className="font-semibold mb-2" style={serifFont}>4.3 Beta Pricing</h3>
            <p className="leading-relaxed mb-4" style={body}>
              While the Service is in beta, pricing, plan limits, and included features may be adjusted with reasonable notice to reflect the Service's development.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>4.4 Price Changes</h3>
            <p className="leading-relaxed" style={body}>
              We reserve the right to modify our pricing at any time. We will provide at least 30 days' notice of any price increases to existing subscribers. Continued use of the Service after a price change constitutes acceptance of the new pricing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>5. Beta Status and Service Changes</h2>
            <p className="leading-relaxed mb-2" style={body}>
              PlanPulse is under active development. You acknowledge and agree that:
            </p>
            <ul className="list-disc pl-6 space-y-2" style={body}>
              <li>Features may be added, changed, or removed during the beta period</li>
              <li>The Service may experience bugs, downtime, or incomplete functionality</li>
              <li>Health scores, pacing calculations, and other automated outputs are provided as planning aids and do not replace your own professional judgement or your obligations to your clients</li>
              <li>We will make reasonable efforts to notify users of material changes, but beta status means changes may occur with limited notice</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>6. Refunds and Cancellations</h2>

            <h3 className="font-semibold mb-2" style={serifFont}>6.1 Cancellation</h3>
            <p className="leading-relaxed mb-4" style={body}>
              You may cancel your subscription at any time through your account settings. Cancellation will take effect at the end of your current billing period.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>6.2 Refund Policy</h3>
            <p className="leading-relaxed mb-4" style={body}>
              All sales are final, whether billed monthly or annually. Refunds will only be considered in cases of accidental subscription, resubscription, or plan upgrade where you contact us within 48 hours of the charge. We will evaluate refund requests on a case-by-case basis at our sole discretion. All refund decisions are final. No partial refunds are given for downgrades, unused months, or unused clients/users within a billing period.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>6.3 Account Deletion</h3>
            <p className="leading-relaxed" style={body}>
              You may delete your account at any time by contacting us. Upon deletion, your data will be removed in accordance with our{' '}
              <Link href="/privacy" className="underline" style={link}>Privacy Policy</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>7. Client Accounts and Connected Platforms</h2>

            <h3 className="font-semibold mb-2" style={serifFont}>7.1 Connecting Third-Party Accounts</h3>
            <p className="leading-relaxed mb-4" style={body}>
              The Service uses Nango, a third-party integration provider, to connect to advertising platforms including Meta and Google Ads via OAuth. This allows the Service to read campaign, budget, and performance data in order to power media plans, pacing, and health scores, and — where you enable it — to build or modify campaigns on your behalf.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>7.2 Authority to Connect Client Accounts</h3>
            <p className="leading-relaxed mb-2" style={body}>
              Where you connect an advertising account belonging to your own client (rather than your agency's own account), you represent and warrant that:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-2" style={body}>
              <li>You have the necessary authority and permission from your client to connect that account to the Service</li>
              <li>Your agreement with your client permits you to share their campaign and performance data with a third-party platform such as PlanPulse</li>
              <li>You will promptly disconnect any client account if your authority to manage it ends</li>
            </ul>
            <p className="leading-relaxed mb-4" style={body}>
              You are solely responsible for your relationship with your clients, including any consequences arising from connecting their accounts to the Service without proper authorisation. This is your responsibility, not ours — we do not verify your authority to connect any given account.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>7.3 Scope of Access</h3>
            <p className="leading-relaxed mb-2" style={body}>By connecting an advertising account, you acknowledge that:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4" style={body}>
              <li>You are granting the Service read access to campaign and performance data, and, where applicable, permission to create or modify campaigns</li>
              <li>Where the Service creates or modifies campaigns on a connected account without your prior review, this is done in a paused or draft state requiring your manual activation, unless you have specifically enabled autonomous or action-taking features that operate without that safeguard</li>
              <li>You should regularly review connected accounts and the permissions granted to the Service</li>
              <li>You can revoke access at any time through your advertising platform's own account settings, or by disconnecting the account within PlanPulse</li>
            </ul>

            <h3 className="font-semibold mb-2" style={serifFont}>7.4 AI Chat and Action-Taking Features</h3>
            <p className="leading-relaxed mb-2" style={body}>
              Certain plans include AI chat features capable of taking actions on connected advertising accounts (for example, adjusting budgets, pausing campaigns, or modifying targeting) without a separate manual approval step. If you enable or use these features:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4" style={body}>
              <li>You are solely responsible for reviewing and configuring the permissions, guardrails, and scope given to any action-taking AI feature before use</li>
              <li>You are responsible for the consequences of any action taken by the Service at your direction or under permissions you have granted, including actions you did not specifically anticipate</li>
              <li>AI-generated outputs, recommendations, health scores, and actions may be inaccurate, incomplete, or based on incomplete data, and do not constitute professional or financial advice</li>
              <li>You remain responsible for your own obligations to your clients regardless of any action taken, or not taken, by an AI feature of the Service</li>
            </ul>

            <h3 className="font-semibold mb-2" style={serifFont}>7.5 Data From Connected Accounts</h3>
            <p className="leading-relaxed" style={body}>
              Campaign and performance data pulled from connected accounts is used solely to provide the Service to you (media plans, pacing, and health monitoring) and is not used for any other purpose without your consent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>8. User Content and Intellectual Property</h2>

            <h3 className="font-semibold mb-2" style={serifFont}>8.1 Your Content</h3>
            <p className="leading-relaxed mb-4" style={body}>
              You retain all rights to the media plans, briefs, notes, documents, and other content you create or upload through the Service ("User Content"). By using the Service, you grant us a limited, non-exclusive, royalty-free license to store, display, and process your User Content solely for the purpose of providing the Service.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>8.2 Content Responsibility</h3>
            <p className="leading-relaxed mb-2" style={body}>
              You are solely responsible for your User Content and represent and warrant that:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4" style={body}>
              <li>You own or have the necessary rights to use and share your User Content</li>
              <li>Your User Content does not violate any third-party rights</li>
              <li>Your User Content complies with these Terms and all applicable laws</li>
            </ul>

            <h3 className="font-semibold mb-2" style={serifFont}>8.3 Our Intellectual Property</h3>
            <p className="leading-relaxed" style={body}>
              The Service, including its design, features, functionality, and all content provided by us, is owned by OneOneThree Digital Limited and is protected by copyright, trademark, and other intellectual property laws.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>9. Third-Party Services</h2>

            <h3 className="font-semibold mb-2" style={serifFont}>9.1 Advertising Platforms and Integrations</h3>
            <p className="leading-relaxed mb-4" style={body}>
              The Service connects to third-party advertising platforms (including Meta and Google Ads) through Nango. Your use of these platforms is subject to their respective terms of service and privacy policies. We are not responsible for the actions, policies, downtime, or content of third-party platforms or integration providers.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>9.2 Payment Processing</h3>
            <p className="leading-relaxed mb-4" style={body}>
              Payments are processed by Stripe. Your payment information is subject to Stripe's privacy policy and terms of service.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>9.3 Analytics</h3>
            <p className="leading-relaxed" style={body}>
              We may use analytics services to improve the Service. These services may collect information about your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>10. Prohibited Uses</h2>
            <p className="leading-relaxed mb-2" style={body}>You agree not to use the Service to:</p>
            <ul className="list-disc pl-6 space-y-2" style={body}>
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe on intellectual property rights of others</li>
              <li>Transmit malicious code, viruses, or harmful materials</li>
              <li>Attempt to gain unauthorized access to the Service or related systems</li>
              <li>Interfere with or disrupt the Service or servers</li>
              <li>Connect an advertising account you do not have authority to connect</li>
              <li>Use the Service for any fraudulent or unlawful purpose</li>
              <li>Impersonate any person or entity</li>
              <li>Share your account credentials with others</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>11. Security and Data Protection</h2>

            <h3 className="font-semibold mb-2" style={serifFont}>11.1 Our Security Measures</h3>
            <p className="leading-relaxed mb-4" style={body}>
              We implement reasonable security measures to protect the Service and your data, including using Nango to manage OAuth connections rather than storing platform passwords ourselves. However, we cannot guarantee absolute security.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>11.2 Your Responsibility</h3>
            <p className="leading-relaxed mb-2" style={body}>You are responsible for:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4" style={body}>
              <li>Maintaining the security of your account credentials</li>
              <li>Securing access to your own and your clients' advertising accounts</li>
              <li>Using strong passwords and security practices</li>
              <li>Monitoring connected accounts for unauthorized activity</li>
            </ul>

            <h3 className="font-semibold mb-2" style={serifFont}>11.3 Security Incidents</h3>
            <p className="leading-relaxed" style={body}>
              In the event of a security breach or unauthorized access, we will make reasonable efforts to notify affected users. However, we are not liable for damages resulting from such incidents. You acknowledge that internet-based services and OAuth-connected third-party integrations carry inherent security risks.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>12. Disclaimers and Limitations of Liability</h2>

            <h3 className="font-semibold mb-2" style={serifFont}>12.1 Service Provided "AS IS"</h3>
            <p className="leading-relaxed mb-4 uppercase text-sm" style={body}>
              The Service is provided on an "as is" and "as available" basis without warranties of any kind, either express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>12.2 No Warranty of Security or Accuracy</h3>
            <p className="leading-relaxed mb-4 uppercase text-sm" style={body}>
              We do not warrant that the Service will be uninterrupted, secure, or error-free. We do not guarantee the accuracy of pacing calculations, health scores, AI-generated outputs, or any other output derived from connected advertising accounts, which may be affected by third-party platform changes, API limitations, or data delays. We are not liable for any action taken, or not taken, by an AI feature of the Service on a connected advertising account, including where that feature operates without a manual approval step at your configuration.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>12.3 Limitation of Liability</h3>
            <p className="leading-relaxed mb-2 uppercase text-sm" style={body}>
              To the maximum extent permitted by New Zealand law, in no event shall OneOneThree Digital Limited be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-2 uppercase text-sm" style={body}>
              <li>Loss of profits, data, or business opportunities</li>
              <li>Unauthorized access to or alteration of your transmissions or data</li>
              <li>Security breaches, hacking, or data theft</li>
              <li>Unauthorized posting, campaign creation, or activity on connected advertising accounts</li>
              <li>Decisions made on the basis of pacing calculations, health scores, or AI-generated outputs from the Service</li>
              <li>Actions taken by any AI chat or action-taking feature, whether or not you configured it to require manual approval</li>
              <li>Any damages arising from third-party services or platforms, including Nango, Meta, and Google Ads</li>
            </ul>
            <p className="leading-relaxed mb-4 uppercase text-sm" style={body}>
              Our total liability for any claims arising from your use of the Service shall not exceed the amount you paid us in the 12 months preceding the claim, or $100 NZD, whichever is greater.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>12.4 Third-Party Actions</h3>
            <p className="leading-relaxed" style={body}>
              We are not responsible for the actions of third-party services, including advertising platforms, integration providers, or payment processors. We are not liable for any loss or damage resulting from unauthorized access to or use of accounts on third-party platforms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>13. Indemnification</h2>
            <p className="leading-relaxed mb-2" style={body}>
              You agree to indemnify, defend, and hold harmless OneOneThree Digital Limited, its officers, directors, employees, and agents from any claims, liabilities, damages, losses, and expenses, including reasonable legal fees, arising out of or in any way connected with:
            </p>
            <ul className="list-disc pl-6 space-y-2" style={body}>
              <li>Your use of the Service</li>
              <li>Your User Content</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any rights of another party, including your clients</li>
              <li>Connecting a client's advertising account without proper authority to do so</li>
              <li>Enabling or configuring any AI chat or action-taking feature, and any action it takes as a result</li>
              <li>Granting client portal access to any person, and any data disclosed to them as a result</li>
              <li>Any security breach of your account due to your negligence</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>14. Termination</h2>

            <h3 className="font-semibold mb-2" style={serifFont}>14.1 By You</h3>
            <p className="leading-relaxed mb-4" style={body}>
              You may terminate your account at any time by contacting us.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>14.2 By Us</h3>
            <p className="leading-relaxed mb-2" style={body}>
              We reserve the right to suspend or terminate your account at any time, with or without notice, for:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4" style={body}>
              <li>Violation of these Terms</li>
              <li>Fraudulent, abusive, or illegal activity</li>
              <li>Non-payment of fees</li>
              <li>Any other reason at our sole discretion</li>
            </ul>

            <h3 className="font-semibold mb-2" style={serifFont}>14.3 Effect of Termination</h3>
            <p className="leading-relaxed mb-2" style={body}>Upon termination:</p>
            <ul className="list-disc pl-6 space-y-2" style={body}>
              <li>Your right to use the Service will immediately cease</li>
              <li>You will remain liable for all charges incurred prior to termination</li>
              <li>We may delete your User Content and account data</li>
              <li>Sections of these Terms that by their nature should survive termination will survive</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>15. Changes to Terms</h2>
            <p className="leading-relaxed" style={body}>
              We reserve the right to modify these Terms at any time. We will notify users of material changes by email or through the Service. Your continued use of the Service after changes take effect constitutes acceptance of the modified Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>16. Privacy</h2>
            <p className="leading-relaxed" style={body}>
              Your use of the Service is also governed by our{' '}
              <Link href="/privacy" className="underline" style={link}>Privacy Policy</Link>, which describes how we collect, use, and protect your personal information and data from connected advertising accounts.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>17. Governing Law and Dispute Resolution</h2>

            <h3 className="font-semibold mb-2" style={serifFont}>17.1 Governing Law</h3>
            <p className="leading-relaxed mb-4" style={body}>
              These Terms shall be governed by and construed in accordance with the laws of New Zealand, without regard to conflict of law principles.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>17.2 Jurisdiction</h3>
            <p className="leading-relaxed mb-4" style={body}>
              You agree to submit to the exclusive jurisdiction of the courts of New Zealand for the resolution of any disputes arising from these Terms or your use of the Service.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>17.3 Dispute Resolution</h3>
            <p className="leading-relaxed" style={body}>
              Before filing any legal action, you agree to first contact us to attempt to resolve the dispute informally.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>18. General Provisions</h2>

            <h3 className="font-semibold mb-2" style={serifFont}>18.1 Entire Agreement</h3>
            <p className="leading-relaxed mb-4" style={body}>
              These Terms constitute the entire agreement between you and OneOneThree Digital Limited regarding the Service.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>18.2 Severability</h3>
            <p className="leading-relaxed mb-4" style={body}>
              If any provision of these Terms is found to be unenforceable, the remaining provisions will remain in full effect.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>18.3 Waiver</h3>
            <p className="leading-relaxed mb-4" style={body}>
              Our failure to enforce any provision of these Terms shall not constitute a waiver of that provision or any other provision.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>18.4 Assignment</h3>
            <p className="leading-relaxed mb-4" style={body}>
              You may not assign or transfer these Terms or your account without our prior written consent. We may assign these Terms at any time without notice.
            </p>

            <h3 className="font-semibold mb-2" style={serifFont}>18.5 Force Majeure</h3>
            <p className="leading-relaxed" style={body}>
              We are not liable for any failure or delay in performance due to circumstances beyond our reasonable control, including acts of God, natural disasters, war, terrorism, riots, embargoes, acts of civil or military authorities, fire, floods, accidents, pandemics, strikes, or shortages of transportation, facilities, fuel, energy, labor, or materials.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={serifFont}>19. Contact Information</h2>
            <p className="leading-relaxed" style={body}>
              For questions about these Terms, please contact us at:
            </p>
            <div className="mt-3 p-4 rounded-lg" style={{ background: '#FDFCF8', border: '0.5px solid #E8E4DC' }}>
              <p style={{ color: '#44403C' }}>
                <strong>OneOneThree Digital Limited</strong><br />
                <a href="mailto:cam@oneonethree.co.nz" className="underline" style={link}>
                  cam@oneonethree.co.nz
                </a>
              </p>
            </div>
          </section>
        </div>

        <div className="mt-16 pt-8" style={{ borderTop: '0.5px solid #E8E4DC', color: '#8A8578' }}>
          <p className="text-sm mb-4">
            By using PlanPulse, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions.
          </p>
          <p className="text-sm">
            Also see our{' '}
            <Link href="/privacy" className="underline" style={link}>
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
