import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Dev-only badge: top-left keeps it off the Clinic OS bottom bar; hidden during e2e runs
  devIndicators: process.env.E2E === '1' ? false : { position: 'top-left' },
  // Calendar and booking moved onto Today and /app/book; old links keep working
  async redirects() {
    return [
      { source: '/app/calendar', destination: '/app', permanent: false },
      { source: '/app/calendar/book', destination: '/app/book', permanent: false },
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
