import type { NextConfig } from 'next';

// Baseline security headers for the production site. Content-Security-Policy
// is intentionally NOT set here — it's generated per-request in
// src/middleware.ts instead, because it needs a fresh nonce on every request
// to allow Next.js App Router's own inline hydration scripts to run (a
// static CSP with no nonce blocks them and renders the page blank — this
// broke production once already; see the comment in middleware.ts for the
// full explanation). The headers below don't vary per request, so they're
// fine here.
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
        ],
      },
    ];
  },
};

export default config;
