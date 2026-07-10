// Shared assistant stream contract. Imported by BOTH the server tool-loop
// (run.ts) and the client stream consumers (AssistantChat, useVoiceSession) so
// the NDJSON event shape lives in exactly ONE place. Keep this module free of
// `server-only` and of any server/client-specific imports — it is pure types +
// pure functions usable on either side.

/** Newline-delimited events the assistant route streams to the client. */
export type AssistantEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; phase: "start" | "end"; ok?: boolean }
  | { type: "proposal"; tool: string; preview: string; token: string; details?: unknown }
  // A disambiguation picker: the tool couldn't resolve a name to ONE record, so
  // instead of asking in text (which dead-loops when names collide), it hands the
  // client clickable options. Each option's `send` is a follow-up message that
  // pins the choice by id, so the tap resolves uniquely with no name round-trip.
  | { type: "choice"; tool: string; prompt: string; options: ChoiceOption[] }
  // A navigation action the client router executes. `auto` = the server judged
  // this an explicit "take me there" (auto-navigate, subject to the client's
  // dirty-form/countdown guards); `auto:false` = render as a link only.
  | { type: "navigate"; path: string; label: string; auto: boolean }
  | { type: "conversation"; id: string; title?: string }
  | { type: "message"; role: "user" | "assistant"; id: string }
  | { type: "error"; message: string }
  | { type: "done" };

/**
 * A safe in-app navigation target: a relative path rooted at a single "/".
 * Rejects protocol-relative ("//…"), any scheme (contains ":"), backslash
 * tricks, and control chars. This is the ONE gate — validate on the server
 * before emitting a `navigate`/link, AND on the client before `router.push`.
 * Mirrors (and supersedes) the ad-hoc check PR #44 added to the markdown renderer.
 */
export function isSafeInternalPath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  const p = path.trim();
  if (!p.startsWith("/")) return false; // must be relative to our app
  if (p.startsWith("//")) return false; // protocol-relative -> off-site
  if (p.includes(":")) return false; // no scheme of any kind (javascript:, data:, http:)
  if (p.includes("\\")) return false; // no backslash tricks
  // Control chars (tab/newline/CR/etc.) get stripped by the URL parser and can
  // turn "/\t/evil.com" into a protocol-relative redirect past the checks above.
  if (p.split("").some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f)) return false;
  return true;
}

/**
 * One clickable disambiguation option. `resume` is a signed token the tap POSTs to re-run the tool with
 * the record pinned by id (DETERMINISTIC — never routes back through the model). `send` is a legacy
 * fallback (a chat message the tap sends). At least one must be present.
 */
export type ChoiceOption = { label: string; sublabel?: string; resume?: string; send?: string };

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
export type WriteProposal = { needsConfirmation: true; preview: string; token: string; details?: unknown };

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

/** A tool's disambiguation request (never mutates; the client shows clickable options). */
export type ChoiceRequest = { needsChoice: true; prompt: string; options: ChoiceOption[] };

export function asChoice(out: unknown): ChoiceRequest | null {
  if (!out || typeof out !== "object") return null;
  if ((out as { needsChoice?: unknown }).needsChoice !== true) return null;
  const prompt = (out as { prompt?: unknown }).prompt;
  const options = (out as { options?: unknown }).options;
  if (typeof prompt !== "string" || !prompt) return null;
  if (!Array.isArray(options) || options.length === 0) return null;
  const clean: ChoiceOption[] = [];
  for (const o of options) {
    if (!o || typeof o !== "object") return null;
    const label = (o as { label?: unknown }).label;
    const resume = (o as { resume?: unknown }).resume;
    const send = (o as { send?: unknown }).send;
    if (typeof label !== "string" || !label) return null;
    const hasResume = typeof resume === "string" && resume.length > 0;
    const hasSend = typeof send === "string" && send.length > 0;
    if (!hasResume && !hasSend) return null; // an option must do SOMETHING when tapped
    const sublabel = (o as { sublabel?: unknown }).sublabel;
    clean.push({
      label,
      ...(hasResume ? { resume: resume as string } : {}),
      ...(hasSend ? { send: send as string } : {}),
      ...(typeof sublabel === "string" && sublabel ? { sublabel } : {}),
    });
  }
  return { needsChoice: true, prompt, options: clean.slice(0, 25) }; // cap: a picker isn't a data dump
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
