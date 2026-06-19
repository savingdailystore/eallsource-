import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;
// Sender must be on a domain you've verified in Resend (e.g. noreply@eallsource.com).
// Until your domain is verified, Resend only allows Resend's own onboarding sender,
// which can only deliver to your account's own email — fine for testing.
const FROM = process.env.EMAIL_FROM ?? 'EALLsource <onboarding@resend.dev>';

const resend = apiKey ? new Resend(apiKey) : null;

/**
 * Send a password-reset email. If RESEND_API_KEY isn't configured, we log the
 * link to the server console instead of throwing, so the flow is testable in
 * dev / before the email provider is wired up.
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  if (!resend) {
    console.log(`[email] RESEND_API_KEY not set — password reset link for ${to}:\n${resetUrl}`);
    return;
  }

  const { error } = await resend.emails.send({
    from:    FROM,
    to,
    subject: 'Reset your EALLsource password',
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
        <h2 style="margin:0 0 8px">Reset your password</h2>
        <p style="color:#475569;font-size:14px;line-height:1.6">
          We received a request to reset the password for your EALLsource account.
          Click the button below to choose a new password. This link expires in 1 hour.
        </p>
        <p style="margin:24px 0">
          <a href="${resetUrl}" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block">
            Reset password
          </a>
        </p>
        <p style="color:#94a3b8;font-size:12px;line-height:1.6">
          If you didn't request this, you can safely ignore this email — your password won't change.
          <br />Or paste this link into your browser:<br />
          <span style="color:#475569;word-break:break-all">${resetUrl}</span>
        </p>
      </div>
    `,
  });

  if (error) {
    console.error('[email] Resend send failed:', error);
    throw new Error('Failed to send password reset email');
  }
}
