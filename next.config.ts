import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables forbidden() so pages can render a real 403 for roles without access.
  experimental: {
    authInterrupts: true,
    // Shelf photos are resized in the browser to ~1600px, well under this.
    serverActions: { bodySizeLimit: "4mb" },
  },
  devIndicators: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "covers.openlibrary.org" }],
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
