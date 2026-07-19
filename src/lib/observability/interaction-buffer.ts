// Client-side interaction + network-METADATA ring buffer for Break Mode hunts (Plan 080 Unit 8).
//
// Why: a bug report is far easier to reproduce when you can see the sequence of actions and API
// calls that led to it. Sentry Replay is the rich, rewindable record for a human; THIS buffer is
// the durable, machine-readable trail that lands on the ticket itself, so /bug-triage's fix agent
// can read the repro without the Sentry API, and so the trail survives replay retention + quota.
//
// HARD RULE: metadata only. We record method / same-origin path / status / duration and interaction
// LABELS. We never record request or response bodies, form values, or query strings — those are the
// things that carry customer data. Bodies (in the sandbox only) are Sentry's job, not ours.
//
// Mirrors console-buffer.ts: a pure, unit-testable ring core plus a browser-only singleton
// installer. Unlike the console buffer this is ARMED ON DEMAND — it only records while Break Mode
// is on, so a normal session costs nothing.

import { redactString } from "./console-buffer";
import type { ReplayFidelity } from "./sentry-replay";

export type InteractionRecord = { type: string; ts: number; label?: string; detail?: string };
export type NetworkRecord = {
  method: string;
  path: string;
  ts: number;
  status?: number;
  durationMs?: number;
};
export type DrainedTrail = { interactionTrail: InteractionRecord[]; networkTrail: NetworkRecord[] };

// Bounds. Kept in step with the debugContext clamp so nothing is silently dropped server-side.
export const MAX_INTERACTION_ENTRIES = 100;
export const MAX_NETWORK_ENTRIES = 100;
export const MAX_LABEL_CHARS = 120;

// --- pure helpers -----------------------------------------------------------

/**
 * Describe a clicked element for the trail.
 *
 * In "masked" fidelity (any real customer tenant) we deliberately return the element ROLE ONLY —
 * a button's text can itself be customer data ("Delete Château Margaux 2019"). In "full" fidelity
 * (sandbox) we include a short, redacted label so the repro is readable.
 */
export function describeElement(
  el: { tagName?: string; getAttribute?: (name: string) => string | null; textContent?: string | null } | null,
  fidelity: ReplayFidelity,
): { label?: string; detail?: string } {
  if (!el) return {};
  const tag = (el.tagName ?? "").toLowerCase();
  const role = el.getAttribute?.("role") ?? undefined;
  const detail = role ? `${tag}[role=${role}]` : tag || undefined;
  if (fidelity !== "full") return detail ? { detail } : {};
  const raw = el.getAttribute?.("aria-label") || el.textContent || "";
  const label = redactString(raw.replace(/\s+/g, " ").trim()).slice(0, MAX_LABEL_CHARS);
  return label ? { label, detail } : detail ? { detail } : {};
}

/**
 * Reduce a URL to a same-origin path for the trail. Query strings are DROPPED (they carry ids and
 * search terms). Cross-origin requests return undefined — we only trail our own API.
 */
export function toSameOriginPath(url: string, origin: string): string | undefined {
  try {
    const parsed = new URL(url, origin || undefined);
    if (origin && parsed.origin !== origin) return undefined;
    return parsed.pathname.slice(0, MAX_LABEL_CHARS);
  } catch {
    return undefined;
  }
}

// --- pure ring core ---------------------------------------------------------

export type InteractionBuffer = {
  recordInteraction: (type: string, parts?: { label?: string; detail?: string }) => void;
  recordNetwork: (entry: Omit<NetworkRecord, "ts"> & { ts?: number }) => void;
  drain: () => DrainedTrail;
  clear: () => void;
  size: () => number;
};

/** Create a bounded FIFO trail. Pure (no globals), `now` injectable for deterministic tests. */
export function createInteractionBuffer(opts?: {
  maxInteractions?: number;
  maxNetwork?: number;
  now?: () => number;
}): InteractionBuffer {
  const maxInteractions = opts?.maxInteractions ?? MAX_INTERACTION_ENTRIES;
  const maxNetwork = opts?.maxNetwork ?? MAX_NETWORK_ENTRIES;
  const now = opts?.now ?? (() => Date.now());
  let interactions: InteractionRecord[] = [];
  let network: NetworkRecord[] = [];

  return {
    recordInteraction(type, parts) {
      if (!type) return;
      const entry: InteractionRecord = { type, ts: now() };
      if (parts?.label) entry.label = parts.label.slice(0, MAX_LABEL_CHARS);
      if (parts?.detail) entry.detail = parts.detail.slice(0, MAX_LABEL_CHARS);
      interactions.push(entry);
      if (interactions.length > maxInteractions) {
        interactions = interactions.slice(interactions.length - maxInteractions);
      }
    },
    recordNetwork(entry) {
      if (!entry?.method || !entry?.path) return;
      const record: NetworkRecord = {
        method: entry.method.slice(0, 12),
        path: entry.path.slice(0, MAX_LABEL_CHARS),
        ts: entry.ts ?? now(),
      };
      if (typeof entry.status === "number") record.status = entry.status;
      if (typeof entry.durationMs === "number") record.durationMs = Math.round(entry.durationMs);
      network.push(record);
      if (network.length > maxNetwork) network = network.slice(network.length - maxNetwork);
    },
    drain() {
      return {
        interactionTrail: interactions.map((e) => ({ ...e })),
        networkTrail: network.map((e) => ({ ...e })),
      };
    },
    clear() {
      interactions = [];
      network = [];
    },
    size() {
      return interactions.length + network.length;
    },
  };
}

// --- browser-only singleton installer ---------------------------------------

let singleton: InteractionBuffer | null = null;
let installed = false;
let armed = false;
let activeFidelity: ReplayFidelity = "masked";

/**
 * Install the listeners ONCE (idempotent, no-op outside the browser). Nothing is recorded until
 * `armInteractionCapture` is called, so an un-armed session pays only a listener check. Originals
 * are always called, and every hook is exception-safe so capture can never break the app.
 */
function install(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  singleton = createInteractionBuffer();

  // One delegated click listener for the whole document.
  window.document.addEventListener(
    "click",
    (event) => {
      if (!armed) return;
      try {
        const target = event.target as Element | null;
        const el = target?.closest?.("button, a, [role=button], input, select, summary") ?? target;
        singleton?.recordInteraction("click", describeElement(el, activeFidelity));
      } catch {
        /* never break the app's own click handling */
      }
    },
    true,
  );

  window.document.addEventListener(
    "submit",
    (event) => {
      if (!armed) return;
      try {
        // Form VALUES are never recorded — only that a submit happened, and on what.
        singleton?.recordInteraction("submit", describeElement(event.target as Element, activeFidelity));
      } catch {
        /* swallow */
      }
    },
    true,
  );

  // Route changes: App Router uses history.pushState for soft navigations.
  const recordRoute = () => {
    if (!armed) return;
    try {
      singleton?.recordInteraction("route", { label: window.location.pathname });
    } catch {
      /* swallow */
    }
  };
  const originalPush = window.history.pushState.bind(window.history);
  window.history.pushState = function patchedPushState(...args) {
    const result = originalPush(...(args as Parameters<typeof originalPush>));
    recordRoute();
    return result;
  };
  window.addEventListener("popstate", recordRoute);

  // Network METADATA via a fetch wrapper. Bodies are never read or stored.
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
    if (!armed) return originalFetch(input, init);
    const started = Date.now();
    let method = init?.method ?? "GET";
    let rawUrl = "";
    try {
      if (typeof input === "string") rawUrl = input;
      else if (input instanceof URL) rawUrl = input.href;
      else {
        rawUrl = (input as Request).url;
        method = init?.method ?? (input as Request).method ?? "GET";
      }
    } catch {
      /* fall through with what we have */
    }
    try {
      const response = await originalFetch(input, init);
      try {
        const path = toSameOriginPath(rawUrl, window.location.origin);
        if (path) {
          singleton?.recordNetwork({
            method: method.toUpperCase(),
            path,
            status: response.status,
            durationMs: Date.now() - started,
          });
        }
      } catch {
        /* swallow */
      }
      return response;
    } catch (error) {
      try {
        const path = toSameOriginPath(rawUrl, window.location.origin);
        // A network failure is exactly the kind of thing a bug report needs.
        if (path) {
          singleton?.recordNetwork({
            method: method.toUpperCase(),
            path,
            status: 0,
            durationMs: Date.now() - started,
          });
        }
      } catch {
        /* swallow */
      }
      throw error;
    }
  };
}

/** Start recording at the given fidelity (Break Mode ON). Installs listeners on first use. */
export function armInteractionCapture(fidelity: ReplayFidelity): void {
  install();
  activeFidelity = fidelity;
  armed = true;
}

/** Stop recording (Break Mode OFF). Listeners stay installed but become no-ops. */
export function disarmInteractionCapture(): void {
  armed = false;
}

export function isInteractionCaptureArmed(): boolean {
  return armed;
}

/** Non-destructive snapshot for the bug-report submit payload. */
export function drainInteractionTrail(): DrainedTrail {
  return singleton?.drain() ?? { interactionTrail: [], networkTrail: [] };
}

/** Clear the trail (after a successful submit, and when a hunt ends). */
export function clearInteractionTrail(): void {
  singleton?.clear();
}
