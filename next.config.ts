import type { NextConfig } from 'next';

// Baseline security headers + CSP for the production site. Scoped to what
// the app actually loads today: self-hosted scripts/styles, Google Fonts
// (globals.css @imports fonts.googleapis.com/gstatic.com), data: URIs for
// the MFA setup QR code (generated server-side as a data URL), and the
// retailer/Amazon image hosts already allowlisted in `images.remotePatterns`
// below. Stripe Checkout is a server-side redirect to a Stripe-hosted page,
// not embedded Stripe.js, so no stripe.com script/frame allowance is needed.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const config: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images-na.ssl-images-amazon.com' },
      { protocol: 'https', hostname: 'm.media-amazon.com' },
      { protocol: 'https', hostname: 'images.thdstatic.com' },
      { protocol: 'https', hostname: '**.walmartimages.com' },
      { protocol: 'https', hostname: 'target.scene7.com' },
      { protocol: 'https', hostname: '**.target.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Content-Security-Policy', value: CSP },
        ],
      },
    ];
  },
};

export default config;
