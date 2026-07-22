import * as Sentry from "@sentry/nextjs";
import { isDevNoiseEvent } from "@/lib/observability/dev-noise";

// Edge runtime (middleware, edge routes).
Sentry.init({
  dsn:
    process.env.SENTRY_DSN ??
    "https://39f4918dc60febf79c8e087103ad12b7@o4511665742938112.ingest.us.sentry.io/4511665753817088",

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  enableLogs: true,

  // Drop local dev-build events so they never become GitHub issues (see dev-noise.ts).
  beforeSend: (event) =>
    isDevNoiseEvent(event as unknown as Record<string, unknown>) ? null : event,
});
