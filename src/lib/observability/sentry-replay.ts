// Sentry Session Replay helpers (Plan 080).
//
// Pure, isomorphic helpers so they're unit-testable without the Sentry SDK or a DOM.
// Phase 1 uses buildReplayUrl to deep-link a bug report to its replay. Phase 2 will add
// the fidelity/option builders (resolveReplayFidelity / buildReplayOptions) to this file.

/**
 * Sentry org slug for building replay deep-links. Client-exposed by design (NEXT_PUBLIC_*).
 * Defaults to the current org so the link works even if the env var isn't set.
 */
export const SENTRY_ORG_SLUG = process.env.NEXT_PUBLIC_SENTRY_ORG_SLUG || "bhutan-wine";

// ---------------------------------------------------------------------------
// Replay fidelity (Plan 080)
//
// Fidelity now governs ONE thing: whether the first-party interaction trail keeps readable element
// LABELS (sandbox) or drops them to the element role only (any real customer tenant).
//
// It no longer affects Sentry at all. It used to also gate `networkDetailAllowUrls`, but that made a
// client-writable cookie the only thing standing between a real tenant and full request/response
// body capture — so body capture was removed outright instead (see buildReplayOptions). The cookie
// is still resolved SERVER-side and read at init time, and everything here fails CLOSED to
// "masked", but a tampered value can now at worst reveal our own bounded, redacted, 120-char
// element labels — never a payload.
// ---------------------------------------------------------------------------

export const REPLAY_FIDELITY_COOKIE = "cbh_replay_fidelity";

/** "full" = sandbox tenant, readable trail labels. "masked" = everything else (safe default). */
export type ReplayFidelity = "full" | "masked";

/**
 * Decide capture fidelity from role + effective tenant. Full fidelity requires BOTH a developer
 * role AND the sandbox tenant; anything else (unknown role, real customer tenant, missing values)
 * is masked. Pure.
 */
export function resolveReplayFidelity(input: {
  role?: string | null;
  effectiveTenantId?: string | null;
  sandboxTenantId: string;
}): ReplayFidelity {
  if (input.role !== "developer") return "masked";
  if (!input.effectiveTenantId || input.effectiveTenantId !== input.sandboxTenantId) return "masked";
  return "full";
}

/** Coerce any raw cookie value to a known fidelity, failing closed. Pure. */
export function parseReplayFidelity(raw: string | null | undefined): ReplayFidelity {
  return raw === "full" ? "full" : "masked";
}

/**
 * Read the fidelity from a raw `document.cookie` string. Fails closed when absent/garbled.
 * Pure so init-time behavior is unit-testable without a DOM.
 */
export function readReplayFidelityFromCookieString(cookieString: string | undefined): ReplayFidelity {
  if (!cookieString) return "masked";
  for (const part of cookieString.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === REPLAY_FIDELITY_COOKIE) return parseReplayFidelity(rest.join("="));
  }
  return "masked";
}

/**
 * The replay integration options. Masking is ALWAYS on, and request/response BODIES are NEVER
 * captured — in any tenant, at any fidelity.
 *
 * We previously allowlisted same-origin `/api` bodies in the sandbox (`networkDetailAllowUrls`).
 * That was dropped deliberately. The allowlist was the ONLY behavioural difference between the two
 * fidelities for Sentry, which meant a client-writable hint cookie was the single thing standing
 * between a real customer tenant and full request/response body capture. The obvious mitigation —
 * Sentry's server-side scrubbing — turns out to be best-effort pattern matching for classic PII
 * (credit cards, SSNs, passwords); it would not recognise this domain's sensitive data (lot costs,
 * vendor invoice amounts, customer names), so it could not be the guarantee.
 *
 * Removing body capture closes that hole outright rather than mitigating it. Very little is lost:
 * network METADATA (method / path / status / duration) is captured by our own interaction buffer,
 * error payloads still reach the console ring, and the DOM replay still shows the (masked) session.
 *
 * Pure, and now fidelity-independent — so there is no configuration in which bodies can be captured.
 */
export function buildReplayOptions(): { maskAllText: true; blockAllMedia: true } {
  return { maskAllText: true, blockAllMedia: true };
}

/**
 * Build a Sentry replay deep-link. Returns undefined when either input is missing so callers
 * can simply omit the link rather than emit a broken URL. Pure — no env, no SDK.
 */
export function buildReplayUrl(orgSlug: string | undefined, replayId: string | undefined): string | undefined {
  if (!orgSlug || !replayId) return undefined;
  return `https://${orgSlug}.sentry.io/replays/${replayId}/`;
}

/**
 * Extract a validated Sentry replay deep-link from a stored debugContext (Plan 080 Unit 4). Only an
 * https URL on a *.sentry.io host (no embedded credentials) survives — anything else, or a missing
 * field, returns null. Defensive even though the value was clamped on write. Pure, so it's testable
 * without the server-only feedback loader.
 */
export function safeSentryReplayUrl(debugContext: unknown): string | null {
  if (!debugContext || typeof debugContext !== "object" || Array.isArray(debugContext)) return null;
  const raw = (debugContext as Record<string, unknown>).replayUrl;
  if (typeof raw !== "string" || !raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname.endsWith(".sentry.io") && !url.username && !url.password
      ? raw
      : null;
  } catch {
    return null;
  }
}

/**
 * Render the stored diagnostics trail as a compact, readable block for the developer workspace
 * (Plan 080 Unit 11). The structured arrays stay in `debugContext` for /bug-triage's fix agent; this
 * is purely so a human can read the repro without opening Sentry. Returns null when there's no hunt.
 * Pure + defensive: unknown shapes are skipped rather than trusted.
 */
export function formatHuntTrail(debugContext: unknown): string | null {
  if (!debugContext || typeof debugContext !== "object" || Array.isArray(debugContext)) return null;
  const rec = debugContext as Record<string, unknown>;
  const interactions = Array.isArray(rec.interactionTrail) ? rec.interactionTrail : [];
  const network = Array.isArray(rec.networkTrail) ? rec.networkTrail : [];
  if (!interactions.length && !network.length) return null;

  const lines: string[] = [];
  if (typeof rec.huntId === "string" && rec.huntId) lines.push(`hunt: ${rec.huntId}`);

  type Row = { ts: number; text: string };
  const rows: Row[] = [];
  for (const raw of interactions) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const type = typeof e.type === "string" ? e.type : "?";
    const label = typeof e.label === "string" ? e.label : "";
    const detail = typeof e.detail === "string" ? e.detail : "";
    const what = label || detail || "";
    rows.push({ ts: typeof e.ts === "number" ? e.ts : 0, text: `${type}${what ? ` — ${what}` : ""}` });
  }
  for (const raw of network) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const method = typeof e.method === "string" ? e.method : "?";
    const path = typeof e.path === "string" ? e.path : "?";
    const status = typeof e.status === "number" ? ` → ${e.status}` : "";
    const ms = typeof e.durationMs === "number" ? ` (${e.durationMs}ms)` : "";
    rows.push({ ts: typeof e.ts === "number" ? e.ts : 0, text: `${method} ${path}${status}${ms}` });
  }
  rows.sort((a, b) => a.ts - b.ts);
  for (const row of rows) lines.push(row.text);
  return lines.join("\n");
}

/** The slice of the Sentry Replay integration we depend on. Kept minimal so it's fakeable in tests. */
export type MinimalReplay = {
  getReplayId: () => string | undefined;
  flush: () => Promise<void>;
};

/**
 * Resolve the replay link for a bug report. `flush()` is awaited so the segment uploads BEFORE
 * the report is submitted; any error (no replay, stalled/failed flush) resolves to {} so the
 * report never blocks on it (Plan 080 Unit 3, eng-review flush-rejection guard). Pure given the
 * injected replay + org slug — no SDK, no env.
 */
export async function captureReplayLink(
  replay: MinimalReplay | undefined | null,
  orgSlug: string,
): Promise<{ replayId?: string; replayUrl?: string }> {
  try {
    const replayId = replay?.getReplayId();
    if (!replay || !replayId) return {};
    await replay.flush();
    return { replayId, replayUrl: buildReplayUrl(orgSlug, replayId) };
  } catch {
    return {};
  }
}
