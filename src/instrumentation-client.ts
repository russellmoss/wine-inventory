import * as Sentry from "@sentry/nextjs";

import { installConsoleCapture } from "@/lib/observability/console-buffer";
import {
  buildReplayOptions,
  readReplayFidelityFromCookieString,
} from "@/lib/observability/sentry-replay";

// Replay fidelity is resolved SERVER-side and published as a non-httpOnly hint cookie, because
// Sentry's replay options are init-time only and this file runs before auth is known (Plan 080
// Unit 7). Absent/garbled cookie → "masked", so we always fail closed to: masking on, no bodies.
const replayFidelity = readReplayFidelityFromCookieString(
  typeof document === "undefined" ? undefined : document.cookie,
);
const replayOptions = buildReplayOptions(
  replayFidelity,
  typeof window === "undefined" ? "" : window.location.origin,
);

// Browser/client runtime. DSN is public (it ships in the client bundle either
// way) — the env var lets us point at a different project without a code change.
Sentry.init({
  dsn:
    process.env.NEXT_PUBLIC_SENTRY_DSN ??
    "https://39f4918dc60febf79c8e087103ad12b7@o4511665742938112.ingest.us.sentry.io/4511665753817088",

  // Performance tracing: full in dev, sampled in prod to stay inside the free tier.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Session Replay — capture 10% of sessions, and 100% of sessions with an error.
  // NOTE (Plan 080): Break Mode starts replays on demand, so ambient session sampling could be
  // dialed DOWN to reallocate the capped free-plan quota toward deliberate hunts. Left at 0.1 for
  // now because Phase 1's opportunistic report<->replay linking depends on it; revisit once the
  // exact monthly replay cap is confirmed (Settings → Subscription).
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  enableLogs: true,

  integrations: [
    // Masking is ALWAYS on; network request/response bodies are allowed only in the sandbox
    // tenant ("full" fidelity). Real customer tenants can never reach the body branch.
    Sentry.replayIntegration(replayOptions),
    // Sentry.feedbackIntegration({ colorScheme: "system" }),
  ],
});

// Always-on console + uncaught-error ring buffer for bug reports (Plan 079).
// Installed after Sentry so Sentry's own console breadcrumbs keep working.
installConsoleCapture();

// Report client-side navigation transitions to Sentry (App Router).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
