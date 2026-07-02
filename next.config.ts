import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  org: "bhutan-wine",
  project: "javascript-nextjs",

  // Build-time token for uploading source maps (so prod stack traces are
  // un-minified). Set SENTRY_AUTH_TOKEN in CI/Vercel; without it the build still
  // succeeds, just without source-map upload.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload a wider set of client bundles for readable stack traces.
  widenClientFileUpload: true,

  // Route Sentry ingest through the app to dodge ad-blockers. No middleware today,
  // so no matcher change needed — if middleware is added later, exclude /monitoring.
  tunnelRoute: "/monitoring",

  // Only print Sentry build logs in CI.
  silent: !process.env.CI,
});
