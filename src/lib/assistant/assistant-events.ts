// Shared assistant stream contract. Imported by BOTH the server tool-loop
// (run.ts) and the client stream consumers (AssistantChat, useVoiceSession) so
// the NDJSON event shape lives in exactly ONE place. Keep this module free of
// `server-only` and of any server/client-specific imports — it is pure types +
// pure functions usable on either side.

/** Newline-delimited events the assistant route streams to the client. */
export type AssistantEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; phase: "start" | "end"; ok?: boolean }
  // A confirmation card. TWO shapes (plan 081 U4):
  //  - Ready:  `token` present → Confirm mints the commit.
  //  - Draft:  `draft: true`, NO token → the card renders, states what is unresolved / what blocks it,
  //            and cannot be committed at all. This is the "missing middle" state: before it existed a
  //            tool with an unresolved field had to fall back to prose, which the UI cannot render as a
  //            card — the measured 2-in-7 card-emission bug.
  | { type: "proposal"; tool: string; preview: string; token?: string; draft?: true; details?: unknown }
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

/**
 * Split a streaming NDJSON buffer into complete lines plus the unterminated remainder.
 *
 * Callers append each decoded chunk to `rest` and re-split. When the stream ends they must dispatch
 * whatever `rest` still holds: a line is only complete once its "\n" arrives, so a stream that ends
 * without a trailing newline (truncation, an aborted response, a serverless timeout) would otherwise
 * drop its final event on the floor — and that event can be a `proposal`, i.e. a confirmation card the
 * user never sees. Shared by both stream consumers so they cannot drift.
 */
export function splitNdjsonLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts, rest };
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

/**
 * A write tool's confirmation proposal (never mutates on first call).
 *
 * READY — carries a signed, single-use commit token. Confirm applies it.
 * DRAFT — carries NO token. The tool could describe the change but not make it committable (a required
 *   field is unresolved, or the operation is physically blocked). It still renders as a card, so the
 *   assistant never has to fall back to prose to say "I need one more thing."
 *
 * SECURITY INVARIANT (plan 081 U4): a Draft must never carry a commit token. `asProposal` NORMALIZES —
 * when the draft marker is present the token is dropped and never propagates downstream, so a crafted
 * tool return of `{draft:true, token:"…"}` cannot reach the confirm route. Enforcement is here, at the
 * contract boundary, NOT in the UI.
 */
export type ReadyProposal = {
  needsConfirmation: true;
  draft?: false;
  preview: string;
  token: string;
  details?: unknown;
};

export type DraftProposal = {
  needsConfirmation: true;
  draft: true;
  preview: string;
  token?: undefined;
  details?: unknown;
};

export type WriteProposal = ReadyProposal | DraftProposal;

/**
 * The SINGLE place "is this committable" is decided. Everything that mints, emits, or acts on a token
 * must route through this predicate rather than re-testing `token` ad hoc.
 */
export function isDraftProposal(p: WriteProposal): p is DraftProposal {
  return p.draft === true;
}

export function asProposal(out: unknown): WriteProposal | null {
  if (!out || typeof out !== "object") return null;
  const o = out as { needsConfirmation?: unknown; preview?: unknown; token?: unknown; draft?: unknown; details?: unknown };
  if (o.needsConfirmation !== true) return null;
  if (typeof o.preview !== "string" || !o.preview) return null;

  if (o.draft === true) {
    // Normalize: rebuild the object so a token can NEVER ride along on a draft, whatever the tool returned.
    return { needsConfirmation: true, draft: true, preview: o.preview, ...(o.details !== undefined ? { details: o.details } : {}) };
  }

  if (typeof o.token !== "string" || !o.token) return null;
  return { needsConfirmation: true, preview: o.preview, token: o.token, ...(o.details !== undefined ? { details: o.details } : {}) };
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
