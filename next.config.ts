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

  // Route Sentry ingest through the app to dodge ad-blockers. The auth proxy DOES run on this
  // path now, so /monitoring is on its public allow-list (src/lib/auth/public-paths.ts). Without
  // that entry every envelope from a session-less page is 307'd to /login and dies as a 405 —
  // i.e. the login page reports no client errors at all. Keep the two in sync if this moves.
  tunnelRoute: "/monitoring",

  // Only print Sentry build logs in CI.
  silent: !process.env.CI,
});
