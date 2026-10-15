import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Visit recordings for smart notes go through a server action
  experimental: { serverActions: { bodySizeLimit: '5mb' } },
  // Dev-only badge: top-left keeps it off the Clinic OS bottom bar; hidden during e2e runs
  devIndicators: process.env.E2E === '1' ? false : { position: 'top-left' },
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
