import * as Sentry from "@sentry/nextjs";

// Node.js server runtime.
Sentry.init({
  dsn:
    process.env.SENTRY_DSN ??
    "https://39f4918dc60febf79c8e087103ad12b7@o4511665742938112.ingest.us.sentry.io/4511665753817088",

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Capture local variables in server stack frames — richer context for the
  // self-healing fix loop (ROADMAP Phase 22). NOTE: this can capture values that
  // include tenant PII; scrub via `beforeSend` before this widens to production
  // (see Phase 22 privacy note).
  includeLocalVariables: true,

  enableLogs: true,
});
