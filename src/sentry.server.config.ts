import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/observability/redact";

// Node.js server runtime.
Sentry.init({
  dsn:
    process.env.SENTRY_DSN ??
    "https://39f4918dc60febf79c8e087103ad12b7@o4511665742938112.ingest.us.sentry.io/4511665753817088",

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Capture local variables in server stack frames — richer context for the
  // self-healing fix loop (ROADMAP Phase 22). This CAN capture tokens/PII, so the
  // beforeSend scrubber below drops all OAuth/token material before the event leaves
  // the process (Phase 15 SEC-S4 — Sentry is live in prod).
  includeLocalVariables: true,

  enableLogs: true,

  // SEC-S4: strip access/refresh tokens, auth codes, Authorization headers, and the
  // encrypted-token columns from every event (extra, request, and stack-frame vars).
  beforeSend: (event) => {
    scrubSentryEvent(event as unknown as Record<string, unknown>);
    return event;
  },
});
