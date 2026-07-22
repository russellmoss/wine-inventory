// Drop Sentry events that came from a LOCAL DEV build, not production.
//
// Sentry auto-files every captured error as a GitHub issue, and dev-worktree noise is
// the dominant false positive in this repo's feed: a `npm run dev` session inside
// `.claude/worktrees/<name>` that loses its Neon pooler connection files a fresh
// PrismaClientKnownRequestError per query site. One /bug-triage run closed five such
// issues (#446-#450) that were all the same dev session, alongside exactly one real bug.
//
// The tell is a path — `.claude/worktrees/…` or `.next/dev/…` — which a deployed build
// can never produce (Vercel builds to `.next/` with no `dev` segment, and the worktree
// directory does not exist there). It can sit deep in the stack while the TOP frames
// look production-clean (`src/app/(app)/page.tsx`), so judging by the top frame or the
// title alone is not enough — scan every frame, plus the culprit/transaction/message,
// since Turbopack sometimes leaves the only trace in a mangled module id.
//
// Pure + defensive: never throws (a beforeSend that throws drops the whole event).

/** Path fragments a deployed build cannot produce. */
const DEV_PATH = /\.claude[\\/]+worktrees[\\/]|\.next[\\/]+dev[\\/]/i;

/** Walk the strings worth testing on a Sentry event, in cheap-first order. */
function* candidateStrings(event: Record<string, unknown>): Generator<string> {
  const push = (v: unknown) => (typeof v === "string" ? v : undefined);

  const culprit = push(event.culprit);
  if (culprit) yield culprit;
  const transaction = push(event.transaction);
  if (transaction) yield transaction;

  const msg = event.message;
  if (typeof msg === "string") yield msg;
  else if (msg && typeof msg === "object") {
    const formatted = push((msg as { formatted?: unknown }).formatted);
    if (formatted) yield formatted;
  }

  const exc = event.exception as
    | {
        values?: Array<{
          value?: unknown;
          stacktrace?: {
            frames?: Array<{ filename?: unknown; abs_path?: unknown; module?: unknown }>;
          };
        }>;
      }
    | undefined;
  for (const v of exc?.values ?? []) {
    const value = push(v.value);
    if (value) yield value;
    for (const f of v.stacktrace?.frames ?? []) {
      const filename = push(f.filename);
      if (filename) yield filename;
      const absPath = push(f.abs_path);
      if (absPath) yield absPath;
      const mod = push(f.module);
      if (mod) yield mod;
    }
  }
}

/**
 * True when the event demonstrably originated in a local dev build. Conservative by
 * construction: it matches on paths that only exist on a developer's machine, so a
 * production event can never satisfy it.
 */
export function isDevNoiseEvent(event: Record<string, unknown>): boolean {
  try {
    for (const s of candidateStrings(event)) {
      if (DEV_PATH.test(s)) return true;
    }
    return false;
  } catch {
    return false; // when in doubt, keep the event
  }
}

/**
 * beforeSend helper: return null to drop a dev-noise event, otherwise the event.
 * Keeping this separate from the Sentry configs makes it unit-testable under node.
 */
export function dropDevNoise<E extends Record<string, unknown>>(event: E): E | null {
  return isDevNoiseEvent(event) ? null : event;
}
