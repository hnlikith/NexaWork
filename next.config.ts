import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // @sparticuz/chromium + puppeteer-core must stay external so the Chromium binary
  // ships intact to the serverless function (bundling it breaks executablePath()).
  serverExternalPackages: ["mongoose", "puppeteer", "puppeteer-core", "@sparticuz/chromium", "pdfjs-dist"],
  // Externalizing keeps the JS from being bundled, but Next's file tracer still
  // won't copy the Chromium binary archives (bin/*.br) into the serverless function
  // because they're loaded via a computed path. Force-include them for the routes
  // that generate PDFs, otherwise executablePath() fails with "bin does not exist".
  outputFileTracingIncludes: {
    "/api/onboarding/**": ["./node_modules/@sparticuz/chromium/**"],
    "/api/invoices/**": ["./node_modules/@sparticuz/chromium/**"],
  },
  webpack(config) {
    // pdfjs-dist needs canvas alias to prevent server-side canvas import errors
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async redirects() {
    return [
      { source: "/carrer", destination: "/careers", permanent: true },
      { source: "/carrers", destination: "/careers", permanent: true },
    ];
  },
};

export default nextConfig;
