import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Visit recordings for smart notes go through a server action
  experimental: { serverActions: { bodySizeLimit: '5mb' } },
  // Dev-only badge: top-left keeps it off the Clinic OS bottom bar; hidden during e2e runs
  devIndicators: process.env.E2E === '1' ? false : { position: 'top-left' },
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
