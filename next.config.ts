import type { NextConfig } from "next";

// The browser's own guards on every page, the website's and Clinic OS's: nothing loads from other sites
// but Supabase (the data, photos and recordings) and the Google map in the website's footer; no other
// site may show these pages inside its own (clickjacking); the camera and microphone are for this site
// only. Next's pages carry inline scripts that differ page by page, and a per-request key for them
// (a nonce) would stop pages being built ahead, so scripts from this site may be inline; scripts from
// anywhere else may not run at all.
const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://example.supabase.co').origin
const dev = process.env.NODE_ENV === 'development'
const contentSecurityPolicy = [
  "default-src 'self'",
  // Development's hot reload evaluates code and talks over a socket
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase}`,
  `media-src 'self' blob: ${supabase}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} ${supabase.replace(/^https:/, 'wss:')}${dev ? ' ws:' : ''}`,
  'frame-src https://www.google.com',
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
].join('; ')
const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), browsing-topics=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The React Compiler: components are memoised for us, so screens redraw only what changed
  reactCompiler: true,
  experimental: {
    // Visit recordings for smart notes go through a server action
    serverActions: { bodySizeLimit: '5mb' },
    // In development React's debug details come over the dev server's socket, and a screen opened from
    // the phone's copy with no signal waits for them forever: off during e2e runs (the offline tests)
    reactDebugChannel: process.env.E2E !== '1',
  },
  // Dev-only badge: top-left keeps it off the Clinic OS bottom bar; hidden during e2e runs
  devIndicators: process.env.E2E === '1' ? false : { position: 'top-left' },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  // The old website's pages are sections of the homepage now; /preview was the new website before it went live
  async redirects() {
    return [
      { source: '/about', destination: '/#doctor', permanent: true },
      { source: '/contact', destination: '/#visit', permanent: true },
      { source: '/faq', destination: '/#questions', permanent: true },
      { source: '/preview', destination: '/', permanent: false },
      { source: '/preview/:path*', destination: '/:path*', permanent: false },
    ]
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
