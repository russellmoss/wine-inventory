import { isSafeInternalPath } from "./assistant-events";

// After a confirmed assistant write, should the client actually GO to the thing it just made?
//
// Plan 105 U2 / DM-55 / AC-W2. Until now the commit's `navigate` payload reached the client and was
// rendered as a "View X →" link the user had to click. Phase 9 wants the app to land you on the
// draft with the dock still open and the conversation continuing, so a wrong draft is fixed by a
// sentence instead of by starting over.
//
// This module is the whole decision, kept pure so every rule below is a test rather than a thing we
// hope holds. The component just does what it says.
//
// THE RULE THE FIRST DRAFT OF THE PLAN GOT WRONG (council, Codex C4): guarding the DESTINATION is
// only half of it. The kill is the SOURCE. The dock is mounted in the (app) layout as a sibling of
// <main> (AppShell.tsx:580) so it survives client navigation — but the full-page assistant at
// /assistant does NOT, and AssistantDock unmounts itself there anyway (AssistantDock.tsx:226).
// Navigating away FROM /assistant therefore ends the session, which is exactly what AC-W2 forbids.
//
// "link_only" is not a failure. The proposal card already renders its own "View X →" affordance from
// the same payload, so the target stays one click away; we simply do not yank the user.

/** The deep link a committer returned (`CommitResult.navigate`), as it arrives over the wire. */
export type CommitNavTarget = { path: string; label: string };

export type PostCommitNavReason =
  /** Nothing to go to — the committer returned no navigate payload. */
  | "no_target"
  /** The path failed the internal-path gate. Never navigate, never link. */
  | "unsafe_path"
  /** We are ON the full-page assistant; navigating would end the conversation. */
  | "source_is_assistant"
  /** The target is the full-page assistant, where the dock unmounts. */
  | "target_is_assistant"
  /** Already looking at it — router.refresh() is the whole job. */
  | "already_there"
  /** The page the user is on has unsaved edits; moving them would lose work. */
  | "unsaved_changes"
  /** Nothing in the way. */
  | "ok";

export type PostCommitNavDecision =
  | { kind: "navigate"; path: string; label: string; reason: "ok" }
  | { kind: "link_only"; path: string; label: string; reason: PostCommitNavReason }
  | { kind: "none"; reason: PostCommitNavReason };

/** Strip query/hash so "/assistant?x=1" is still recognised as the assistant page. */
function pathnameOf(pathOrUrl: string): string {
  const cut = pathOrUrl.search(/[?#]/);
  return (cut === -1 ? pathOrUrl : pathOrUrl.slice(0, cut)).trim();
}

/**
 * The full-page assistant. Mirrors AssistantDock.tsx:226 exactly — if that predicate ever changes,
 * this one has to move with it or a navigation will silently start killing sessions again.
 */
export function isAssistantPage(pathOrUrl: string): boolean {
  const p = pathnameOf(pathOrUrl);
  return p === "/assistant" || p.startsWith("/assistant/");
}

function sameRoute(a: string, b: string): boolean {
  const norm = (s: string) => {
    const p = pathnameOf(s);
    return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
  };
  return norm(a) === norm(b);
}

/**
 * Decide what to do with a commit's navigate payload.
 *
 * `currentPath` is where the user is RIGHT NOW (usePathname()). `hasUnsavedChanges` is the same
 * signal the pre-existing navigate-event path already respects.
 */
export function decidePostCommitNav(input: {
  target?: Partial<CommitNavTarget> | null;
  currentPath: string;
  hasUnsavedChanges: boolean;
}): PostCommitNavDecision {
  const { target, currentPath, hasUnsavedChanges } = input;

  if (!target || typeof target.path !== "string" || typeof target.label !== "string" || !target.label) {
    return { kind: "none", reason: "no_target" };
  }
  // Server-side gate re-applied client-side, deliberately. Both ends check.
  if (!isSafeInternalPath(target.path)) {
    return { kind: "none", reason: "unsafe_path" };
  }

  const path = target.path;
  const label = target.label;

  // Leaving the full-page assistant ends the session (the page does not survive navigation).
  if (isAssistantPage(currentPath)) {
    return { kind: "link_only", path, label, reason: "source_is_assistant" };
  }
  // Landing on it unmounts the dock, which loses the conversation just as thoroughly.
  if (isAssistantPage(path)) {
    return { kind: "link_only", path, label, reason: "target_is_assistant" };
  }
  // Already on the object. The refresh the caller runs anyway is the entire update.
  if (sameRoute(currentPath, path)) {
    return { kind: "none", reason: "already_there" };
  }
  // Never move a user off a page they have unsaved edits on.
  if (hasUnsavedChanges) {
    return { kind: "link_only", path, label, reason: "unsaved_changes" };
  }

  return { kind: "navigate", path, label, reason: "ok" };
}

/**
 * Narrow an untrusted `{ok, message, navigate}` confirm response's navigate field.
 *
 * The exhaustive AssistantEvent switch does NOT cover this: the confirm route is plain JSON, not an
 * NDJSON event, so its `never` default can never catch a shape change here (council, Codex S6).
 * This is that missing parser.
 */
export function parseCommitNavTarget(raw: unknown): CommitNavTarget | null {
  if (!raw || typeof raw !== "object") return null;
  const { path, label } = raw as { path?: unknown; label?: unknown };
  if (typeof path !== "string" || !isSafeInternalPath(path)) return null;
  if (typeof label !== "string" || !label) return null;
  return { path, label };
}
