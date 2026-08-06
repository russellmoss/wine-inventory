import "server-only";
import { unstable_rethrow } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { ActionError } from "@/lib/action-error";
import type { ActionResult } from "@/lib/action-result";

/**
 * Settle an action body into an `ActionResult` WITHOUT losing the bug.
 *
 * WHY THIS EXISTS. Two modules (spray, planned-harvest) hand-rolled a wrapper that caught everything and
 * returned `e.message` to the browser. That is wrong in both directions at once:
 *
 *   - it LEAKS internals — a raw Prisma error, a constraint name, a connection string fragment, whatever
 *     `e.message` happens to hold, straight into the UI;
 *   - it SWALLOWS the bug — nothing reaches Sentry, so the failure is invisible. There are 5
 *     `captureException` calls in the whole of `src/` against 40 sites returning a raw message.
 *
 * That second half is not hypothetical here. NOW.md records it twice in one week: *"an error path that
 * logs nothing is itself the P0"* — once for the assistant (a turn that died server-side left only an
 * ABSENCE as evidence) and once for the OAuth/Sentry tunnel. This is the shape that produced both.
 *
 * The canonical `settleAction` (in the client-safe `action-result.ts`) rethrows unexpected errors so
 * Next redacts them and Sentry's instrumentation catches them. That is right for a `safeAction`, but it
 * cannot be used by a module whose whole contract is return-don't-throw — a throw there escapes to Next
 * and the user gets the opaque "An error occurred in the Server Components render" string.
 *
 * So this is the third way, and the branch order matters:
 *   1. `unstable_rethrow` — framework control flow (redirect / notFound / dynamic bailout) is NOT an
 *      error and must reach Next untouched. This is REDIRECT-1; getting it wrong strands the user on the
 *      page with a `NEXT_REDIRECT;replace;/login;307;` string where a login redirect should have been.
 *   2. `ActionError` — deliberate, user-safe, already written for a human. Return it verbatim with its code.
 *   3. Anything else — a real bug. Capture it to Sentry WITH context, and return a GENERIC message. The
 *      user learns something went wrong; the detail goes where an engineer will see it.
 *
 * Lives in a server-only module because it imports Sentry. `action-result.ts` stays dependency-light and
 * client-importable on purpose (`unwrap` runs in the browser) — pulling Sentry in there would break that.
 */
export async function settleWithCapture<T>(
  run: () => Promise<T>,
  /** Where this ran, so a Sentry issue is actionable rather than an anonymous stack. */
  context: { action: string; area?: string; extra?: Record<string, unknown> },
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (e) {
    // MUST be first: a redirect is control flow, not a failure (REDIRECT-1).
    unstable_rethrow(e);

    if (e instanceof ActionError) {
      return { ok: false, error: e.message, code: e.code };
    }

    Sentry.captureException(e, {
      tags: { action: context.action, area: context.area ?? "action" },
      extra: context.extra,
    });
    // Deliberately NOT `e.message`. An unexpected error's text is written for engineers, not users, and
    // may carry schema or infrastructure detail. The generic string is the whole point.
    return {
      ok: false,
      error: "Something went wrong. The error has been reported — try again, or tell us what you were doing.",
      code: "UNEXPECTED",
    };
  }
}
