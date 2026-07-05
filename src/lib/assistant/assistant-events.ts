// Shared assistant stream contract. Imported by BOTH the server tool-loop
// (run.ts) and the client stream consumers (AssistantChat, useVoiceSession) so
// the NDJSON event shape lives in exactly ONE place. Keep this module free of
// `server-only` and of any server/client-specific imports — it is pure types +
// pure functions usable on either side.

/** Newline-delimited events the assistant route streams to the client. */
export type AssistantEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; phase: "start" | "end"; ok?: boolean }
  | { type: "proposal"; tool: string; preview: string; token: string }
  // A navigation action the client router executes. `auto` = the server judged
  // this an explicit "take me there" (auto-navigate, subject to the client's
  // dirty-form/countdown guards); `auto:false` = render as a link only.
  | { type: "navigate"; path: string; label: string; auto: boolean }
  | { type: "conversation"; id: string; title?: string }
  | { type: "error"; message: string }
  | { type: "done" };

/**
 * A safe in-app navigation target: a relative path rooted at a single "/".
 * Rejects protocol-relative ("//…"), any scheme (contains ":"), and backslash
 * tricks. This is the ONE gate — validate on the server before emitting a
 * `navigate`/link, AND on the client before `router.push`. Mirrors (and
 * supersedes) the ad-hoc check PR #44 added to the markdown renderer.
 */
export function isSafeInternalPath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  const p = path.trim();
  if (!p.startsWith("/")) return false; // must be relative to our app
  if (p.startsWith("//")) return false; // protocol-relative -> off-site
  if (p.includes(":")) return false; // no scheme of any kind (javascript:, data:, http:)
  if (p.includes("\\")) return false; // no backslash tricks
  return true;
}

/** Parse one NDJSON line into an AssistantEvent, or null if unparseable/invalid. */
export function parseEvent(line: string): AssistantEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed) as unknown;
    if (obj && typeof obj === "object" && typeof (obj as { type?: unknown }).type === "string") {
      return obj as AssistantEvent;
    }
  } catch {
    /* partial/garbled line */
  }
  return null;
}

// ---- Tool-output shape guards (a tool RETURNS one of these; run.ts detects the
// shape and turns it into the matching stream event, mirroring the proposal flow) ----

/** A write tool's confirmation proposal (never mutates on first call). */
export type WriteProposal = { needsConfirmation: true; preview: string; token: string };

export function asProposal(out: unknown): WriteProposal | null {
  if (
    out &&
    typeof out === "object" &&
    (out as { needsConfirmation?: unknown }).needsConfirmation === true &&
    typeof (out as { preview?: unknown }).preview === "string" &&
    typeof (out as { token?: unknown }).token === "string"
  ) {
    return out as WriteProposal;
  }
  return null;
}

/** A navigate tool's payload. `auto` defaults to false (link) unless the tool set it. */
export type NavigationPayload = { path: string; label: string; auto: boolean };

export function asNavigation(out: unknown): NavigationPayload | null {
  if (!out || typeof out !== "object") return null;
  const nav = (out as { navigate?: unknown }).navigate;
  if (!nav || typeof nav !== "object") return null;
  const path = (nav as { path?: unknown }).path;
  const label = (nav as { label?: unknown }).label;
  if (!isSafeInternalPath(path)) return null; // server-side gate: never emit an unsafe path
  if (typeof label !== "string" || !label) return null;
  const auto = (nav as { auto?: unknown }).auto === true;
  return { path, label, auto };
}
