import { LegalPage, SUPPORT_EMAIL } from '@/components/marketing/MarketingShell';

export const metadata = {
  title: 'Privacy Policy',
  description: 'How EALLsource collects, uses, stores, and protects your data, including Amazon Selling Partner API data.',
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="June 27, 2026">
      <p>
        EALLsource (“EALLsource,” “we,” “us,” or “our”) operates the Amazon FBA arbitrage sourcing and
        repricing platform available at <a href="https://eallsource.com">eallsource.com</a>. This Privacy
        Policy explains what information we collect, how we use it, and the choices you have. By using
        EALLsource you agree to the practices described here.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li><strong>Account information</strong> — your name, email address, organization name, and an encrypted (hashed) password.</li>
        <li><strong>Billing information</strong> — subscription plan and status. Card payments are processed by Stripe; we never store your full card number.</li>
        <li><strong>Amazon Selling Partner API (SP-API) data</strong> — when you connect your Amazon seller account, we access only the data needed to provide the service: your seller and marketplace identifiers, FBA inventory levels, product listings, competitive pricing, and fee estimates for <strong>your own seller account</strong>.</li>
        <li><strong>Usage data</strong> — saved searches, generated leads, repricing rules, and audit logs of actions taken in the app.</li>
      </ul>

      <h2>2. Amazon data: what we do and do not access</h2>
      <p>
        EALLsource requests only non-PII SP-API roles (Pricing, Product Listing, Inventory and Order
        Tracking, and Amazon Fulfillment). <strong>We do not request, access, store, or process Personally
        Identifiable Information (PII) about your buyers</strong> — no buyer names, shipping addresses,
        email addresses, or order-level personal data. Amazon authorization tokens (access and refresh
        tokens) are encrypted with AES-256-GCM before being stored and are used solely to make API calls
        on your behalf.
      </p>

      <h2>3. How we use your information</h2>
      <ul>
        <li>To provide and operate the sourcing, validation, inventory, and repricing features you request.</li>
        <li>To authenticate you and secure your account.</li>
        <li>To process subscriptions and billing.</li>
        <li>To communicate with you about your account, support requests, and service changes.</li>
      </ul>
      <p>We do not sell your data, and we do not use Amazon SP-API data for any purpose other than providing the service to you.</p>

      <h2>4. How we share information</h2>
      <p>We share data only with service providers that help us run EALLsource, under contractual confidentiality and security obligations:</p>
      <ul>
        <li><strong>Hosting &amp; database</strong> — cloud infrastructure providers (Vercel, Neon PostgreSQL).</li>
        <li><strong>Payments</strong> — Stripe, for subscription billing.</li>
        <li><strong>Amazon</strong> — to make the SP-API calls you authorize.</li>
      </ul>
      <p>We may also disclose information if required by law or to protect our rights and users.</p>

      <h2>5. Data security</h2>
      <p>
        All data is transmitted over TLS 1.2 or higher. Amazon tokens and other sensitive values are
        encrypted at rest using AES-256-GCM. Access to user accounts is protected by multi-factor
        authentication (TOTP), and access to data is scoped per organization with role-based controls.
      </p>

      <h2>6. Data retention and deletion</h2>
      <p>
        We retain your data for as long as your account is active. You may disconnect your Amazon account
        at any time from the dashboard, which deactivates and removes the stored Amazon tokens. To delete
        your account and associated data, contact us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>

      <h2>7. Your rights</h2>
      <p>You may access, correct, export, or delete your personal data by contacting us. We will respond within a reasonable timeframe.</p>

      <h2>8. Changes to this policy</h2>
      <p>We may update this Privacy Policy from time to time. Material changes will be posted on this page with an updated “Last updated” date.</p>

      <h2>9. Contact</h2>
      <p>Questions about this policy or your data? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
    </LegalPage>
  );
}
