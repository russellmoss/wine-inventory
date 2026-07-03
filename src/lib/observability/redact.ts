// Phase 15 SEC-S4 — recursively redact OAuth/token material from a value before it leaves the process
// (Sentry beforeSend, and anywhere we might serialize an object into a log). `includeLocalVariables`
// is on for the server Sentry, so a token could otherwise ride out inside a stack frame's captured
// vars. Pure + unit-tested. Redacts by KEY NAME (case-insensitive), so the value never has to be
// pattern-matched.

const SENSITIVE_KEY = /^(access[_-]?token|refresh[_-]?token|refreshtokenct|dekwrapped|pkce[_-]?verifier|code[_-]?verifier|code[_-]?challenge|client[_-]?secret|authorization|x[_-]?refresh[_-]?token[_-]?expires[_-]?in|bearer|secret|password|token)$/i;

// A single-token OAuth authorization code arrives as `code` in the callback query — redact it too,
// but only when it clearly names an auth code (not e.g. a product "code"), so keep this separate and
// applied to known OAuth carriers rather than blanket-redacting every "code".
const REDACTED = "[redacted]";

/** Deep-redact in place: any property whose KEY matches SENSITIVE_KEY has its value replaced. */
export function redactSensitive<T>(value: T, seen = new WeakSet<object>()): T {
  if (value == null || typeof value !== "object") return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = redactSensitive(value[i], seen);
    return value;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEY.test(key)) {
      obj[key] = REDACTED;
    } else {
      obj[key] = redactSensitive(obj[key], seen);
    }
  }
  return value;
}

/**
 * Scrub a Sentry event: request headers/data/cookies, `extra`, `contexts`, and captured local
 * variables in every stack frame. Best-effort + defensive (never throws — a scrubber that throws
 * would drop the whole event). Also strips the OAuth `code`/`state` from any captured URL.
 */
export function scrubSentryEvent<E extends Record<string, unknown>>(event: E): E {
  try {
    redactSensitive(event.extra);
    redactSensitive(event.contexts);
    const req = event.request as { headers?: unknown; data?: unknown; cookies?: unknown; query_string?: unknown; url?: unknown } | undefined;
    if (req) {
      redactSensitive(req.headers);
      redactSensitive(req.data);
      redactSensitive(req.cookies);
      if (typeof req.url === "string") req.url = stripOAuthParams(req.url);
      if (typeof req.query_string === "string") req.query_string = stripOAuthParams(req.query_string);
    }
    const exc = event.exception as { values?: Array<{ stacktrace?: { frames?: Array<{ vars?: unknown }> } }> } | undefined;
    for (const v of exc?.values ?? []) {
      for (const f of v.stacktrace?.frames ?? []) redactSensitive(f.vars);
    }
  } catch {
    // never let scrubbing crash telemetry
  }
  return event;
}

/** Replace the values of OAuth-carrier query params (code, state, access_token, refresh_token). */
export function stripOAuthParams(url: string): string {
  return url.replace(/([?&](?:code|state|access_token|refresh_token|token)=)[^&#]*/gi, `$1${REDACTED}`);
}
