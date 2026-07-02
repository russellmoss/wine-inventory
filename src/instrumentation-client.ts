import * as Sentry from "@sentry/nextjs";

// Browser/client runtime. DSN is public (it ships in the client bundle either
// way) — the env var lets us point at a different project without a code change.
Sentry.init({
  dsn:
    process.env.NEXT_PUBLIC_SENTRY_DSN ??
    "https://39f4918dc60febf79c8e087103ad12b7@o4511665742938112.ingest.us.sentry.io/4511665753817088",

  // Performance tracing: full in dev, sampled in prod to stay inside the free tier.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Session Replay — capture 10% of sessions, and 100% of sessions with an error.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  enableLogs: true,

  integrations: [
    Sentry.replayIntegration(),
    // Sentry.feedbackIntegration({ colorScheme: "system" }),
  ],
});

// Report client-side navigation transitions to Sentry (App Router).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
