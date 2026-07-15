import { ActionError, type ActionErrorCode } from "@/lib/action-error";

// Why this file exists: a Next.js Server Action can only surface a user-safe message to the client as
// a RETURN VALUE. A *thrown* error — even a clean, user-safe `ActionError` — is redacted in production
// to the opaque "An error occurred in the Server Components render…" string (only the `digest`
// survives). So the safe path is: catch the EXPECTED `ActionError` on the server, ship its message as
// data, and re-throw it on the client via `unwrap` so existing `try/catch (e) { e.message }` call
// sites keep working unchanged. Unexpected errors (real bugs) are NOT caught here — they stay redacted
// and flow to Sentry. Isomorphic + dependency-light so it is unit-testable and safe to import from
// both server actions and client components. Behaviour is locked by `test/action-result.test.ts`.

/** The discriminated result a `safeAction` returns instead of throwing. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: ActionErrorCode };

/**
 * Run an action body and settle it into an `ActionResult`: an expected `ActionError` becomes a
 * returned `{ ok: false }` (its message survives serialization to the client); any OTHER error is a
 * real bug — rethrow it so Next.js redacts it and Sentry captures it, never leaking internals. Pure of
 * auth/tenant concerns so the wrappers (`safeAction`) compose it and tests can exercise it directly.
 */
export async function settleAction<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: e.message, code: e.code };
    throw e;
  }
}

/**
 * Client-side companion: unwrap an `ActionResult`, re-throwing the server's user-safe `ActionError` on
 * failure so a `catch (e) { setError(e.message) }` shows the REAL message instead of Next's opaque
 * production redaction. Returns the payload on success. Keeps every migrated call site a one-liner
 * (`unwrap(await someSafeAction(...))`) with its existing try/catch intact.
 */
export function unwrap<T>(result: ActionResult<T>): T {
  if (result.ok) return result.data;
  throw new ActionError(result.error, result.code);
}
