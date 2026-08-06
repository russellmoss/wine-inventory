import "server-only";
import { timingSafeEqual } from "node:crypto";
import { unstable_rethrow } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { ActionError } from "@/lib/action-error";

/**
 * Error handling for ROUTE handlers — the `Response.json` sibling of `settleWithCapture`.
 *
 * Same defect, different shape. Route handlers were doing
 * `catch (e) { return Response.json({ error: e.message }, { status: 500 }) }`, which told Sentry nothing.
 * That is the shape NOW.md records twice in one week as the reason two failures were invisible.
 *
 * TWO helpers rather than one, because the surfaces differ in a way that matters:
 *
 *   `routeError` — BROWSER-facing routes (assistant confirm, attachments, ingest, feedback). The message
 *     is REDACTED: a Prisma error names tables, columns and constraints, and none of that belongs in a
 *     response a browser can read.
 *
 *   `cronError` — the Vercel cron endpoints. The caller is a scheduler holding a bearer secret and the
 *     body lands in cron logs, so the message is KEPT: it is the only diagnostic an on-call human gets,
 *     and redacting it would make the logs useless. What was missing was never the redaction — it was the
 *     capture.
 *
 * Both put `unstable_rethrow` first, because a redirect is control flow and not a failure (REDIRECT-1).
 */

/** Map a deliberate ActionError to the status its code implies. */
function statusFor(code: ActionError["code"]): number {
  switch (code) {
    case "UNAUTHENTICATED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "CONFLICT":
      return 409;
    case "VALIDATION":
      return 400;
    default:
      return 500;
  }
}

export type RouteContext = { route: string; area?: string; extra?: Record<string, unknown> };

/**
 * Browser-facing route failure: capture, then answer with a GENERIC message.
 * An expected `ActionError` still passes its own text through — it was written for a human.
 */
export function routeError(e: unknown, ctx: RouteContext): Response {
  unstable_rethrow(e);

  if (e instanceof ActionError) {
    return Response.json({ ok: false, error: e.message, code: e.code }, { status: statusFor(e.code) });
  }

  Sentry.captureException(e, {
    tags: { route: ctx.route, area: ctx.area ?? "route" },
    extra: ctx.extra,
  });
  return Response.json(
    { ok: false, error: "Something went wrong. The error has been reported.", code: "UNEXPECTED" },
    { status: 500 },
  );
}

/**
 * Cron failure: capture, and KEEP the message — the audience is an operator reading cron logs, not a user.
 * `fallback` is what to say when the throw carried no message at all.
 */
export function cronError(e: unknown, ctx: RouteContext, fallback = "Sweep failed."): Response {
  unstable_rethrow(e);

  Sentry.captureException(e, {
    tags: { route: ctx.route, area: ctx.area ?? "cron" },
    extra: ctx.extra,
  });
  return Response.json({ ok: false, error: e instanceof Error ? e.message : fallback }, { status: 500 });
}

/**
 * THE cron bearer gate — one copy.
 *
 * This was inlined identically in all 13 cron routes: same constant-time compare, same length pre-check,
 * same fail-closed `if (!secret) return false`. Every copy was correct, which is exactly what made the
 * duplication dangerous — nothing forced a 14th route to include one, and a cron endpoint without the
 * gate is an unauthenticated way to trigger a tenant-wide sweep.
 *
 * Fail-closed on a missing `CRON_SECRET`: an unset secret must not mean "let everyone in".
 * Constant-time compare, and the length pre-check is required because `timingSafeEqual` throws on a
 * length mismatch rather than returning false.
 */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const presented = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

/** The 401 every cron route returns when the gate refuses. */
export function cronUnauthorized(): Response {
  return Response.json({ error: "Unauthorized." }, { status: 401 });
}
