import { LegalPage, SUPPORT_EMAIL } from '@/components/marketing/MarketingShell';

export const metadata = {
  title: 'Terms of Service',
  description: 'The terms governing your use of the EALLsource platform.',
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="June 27, 2026">
      <p>
        These Terms of Service (“Terms”) govern your access to and use of EALLsource (“the Service”),
        operated by EALLsource (“we,” “us,” or “our”). By creating an account or using the Service, you
        agree to these Terms. If you do not agree, do not use the Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        EALLsource provides tools to source online-arbitrage product leads, validate them against Amazon
        pricing, fees, and demand data, synchronize FBA inventory, and reprice Amazon listings. The Service
        is provided to assist your independent business decisions; we do not guarantee any particular
        financial result.
      </p>

      <h2>2. Eligibility and accounts</h2>
      <ul>
        <li>You must be at least 18 years old and able to form a binding contract.</li>
        <li>You are responsible for the accuracy of your account information and for keeping your credentials secure. We strongly recommend keeping multi-factor authentication enabled.</li>
        <li>You are responsible for all activity that occurs under your account.</li>
      </ul>

      <h2>3. Amazon and third-party accounts</h2>
      <p>
        When you connect your Amazon seller account, you authorize EALLsource to access Amazon Selling
        Partner API data on your behalf, solely to provide the Service. You agree to comply with Amazon’s
        applicable policies, including the Amazon Services Business Solutions Agreement and the Acceptable
        Use Policy, and with all applicable laws when using the Service. You may revoke this access at any
        time from your dashboard or from Amazon Seller Central.
      </p>

      <h2>4. Subscriptions and billing</h2>
      <ul>
        <li>Paid plans are billed in advance on a recurring monthly basis through Stripe.</li>
        <li>Subscriptions renew automatically until cancelled. You may cancel at any time; cancellation takes effect at the end of the current billing period.</li>
        <li>Except where required by law, fees already paid are non-refundable.</li>
      </ul>

      <h2>5. Acceptable use</h2>
      <p>You agree not to: misuse or attempt to disrupt the Service; reverse engineer or scrape the Service except as expressly permitted; use the Service to violate any law or any third party’s rights, including Amazon’s policies; or share your account with unauthorized users.</p>

      <h2>6. Intellectual property</h2>
      <p>The Service, including its software, design, and content, is owned by EALLsource and protected by intellectual-property laws. You retain ownership of the data you provide and the data retrieved from your connected accounts.</p>

      <h2>7. Disclaimers</h2>
      <p>
        The Service is provided “as is” and “as available” without warranties of any kind, express or
        implied. Pricing, fee, and demand data are estimates that may be inaccurate or out of date; you are
        solely responsible for your sourcing, pricing, and inventory decisions. EALLsource is not a
        financial, investment, tax, or legal advisor.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, EALLsource will not be liable for any indirect, incidental,
        special, consequential, or punitive damages, or for lost profits or revenues, arising out of or
        related to your use of the Service. Our total liability for any claim is limited to the amount you
        paid us in the twelve months preceding the claim.
      </p>

      <h2>9. Termination</h2>
      <p>You may stop using the Service and delete your account at any time. We may suspend or terminate accounts that violate these Terms or that create risk or legal exposure for us or other users.</p>

      <h2>10. Changes to these Terms</h2>
      <p>We may update these Terms from time to time. Material changes will be posted on this page with an updated date. Continued use of the Service after changes take effect constitutes acceptance.</p>

      <h2>11. Contact</h2>
      <p>Questions about these Terms? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
    </LegalPage>
  );
}
