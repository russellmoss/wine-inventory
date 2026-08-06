---
id: ERRCAP-1
group: observability
severity: high
enforcedBy: app-code
verify: "npm run verify:error-capture"
decision: "Code-health review 2026-08-05 (finding 3)"
status: guarded
appliesTo:
  - src/lib/action-settle.ts
  - src/lib/route-settle.ts
  - src/app/api/
tags:
  - invariant
---

# ERRCAP-1 — a returned error is a reported error

> [!warning] Invariant (high, app-code)
> If a `catch` block RETURNS the caught error's message to a caller, it must also CAPTURE that error — `Sentry.captureException` in the block, or a helper that does it on your behalf (`settleWithCapture`, `routeError`, `cronError`). Answering the caller and telling no one is the shape that makes a production failure evidence-free.

**Guarded by:** `npm run verify:error-capture`
**Decision:** Code-health review 2026-08-05 (finding 3) — see [[INVARIANTS]].
**Applies to:** `src/lib/action-settle.ts`, `src/lib/route-settle.ts`, `src/app/api/`

## The defect

40 sites did this, and there were **5** `captureException` calls in the whole of `src/`:

```ts
catch (e) {
  return { ok: false, error: e instanceof Error ? e.message : "Something failed." };
}
```

It reads like careful defensive hygiene. It is the opposite: the user gets a string, the incident
leaves no trace, and nobody ever learns it happened. [[NOW]] records the consequence twice in one
week — *"an error path that logs nothing is itself the P0"* — once for the assistant, where a turn
that died server-side left only an ABSENCE as evidence, and once for the OAuth/Sentry tunnel.

## Why the rule is "capture", not "redact"

Leaking internals is a real second defect (a Prisma error names tables, columns and constraints), but
it is **not** what this invariant enforces, because a blanket redaction rule would be wrong in both
directions:

- a **cron** endpoint is called by Vercel's scheduler holding a bearer secret, and its response body
  lands in cron logs. The message there is operator-facing and is the only diagnostic an on-call
  human gets — redacting it makes the logs useless.
- a **browser-facing** route must redact: nothing in a Prisma error is written for a user.

What is invariant across both is that the error must reach Sentry. So that is what the guard asserts,
and redaction stays a per-surface decision the author makes by picking the right helper.

## The three helpers

| Helper | Surface | Message | Status |
| --- | --- | --- | --- |
| `settleWithCapture` (`src/lib/action-settle.ts`) | server actions | redacted | n/a (returns a result) |
| `routeError` (`src/lib/route-settle.ts`) | browser-facing route handlers | redacted | 500 |
| `cronError` (`src/lib/route-settle.ts`) | `/api/cron/*` | kept | 500 |

All three lead with `unstable_rethrow(e)` ([[REDIRECT-1]]) and all three pass an **expected**
`ActionError` through verbatim without capturing it — a refusal is not a bug, and capturing refusals
buries the real failures in noise. `routeError` additionally maps `ActionError.code` to the status the
code implies (`FORBIDDEN` → 403, `CONFLICT` → 409, `VALIDATION` → 400).

## The consequence for deliberate throws

This makes the `Error` vs `ActionError` distinction load-bearing rather than stylistic, because the
helpers branch on it. A deliberate, user-facing throw must be an `ActionError`:

```ts
// blob.ts — the user needs to know their file was too big.
throw new ActionError("Image must be 5 MB or smaller.", "VALIDATION");

// confirm.ts — a missing env var is a deployment bug. Plain Error, so it gets captured and redacted.
throw new Error("BETTER_AUTH_SECRET is not set; cannot sign assistant confirmations.");
```

Before this, the upload and assistant routes threw both classes as plain `Error` into one `catch` and
answered `400` for both — so a blob-store outage was reported to the user as a validation problem and
to Sentry not at all.

## What the guard proves, and what it does not

Pure static AST scan over `src/`, no DB and no typechecker. It finds catch blocks that return the
caught binding's `.message` (or `String(e)`) as an `error`/`message` property, and asserts the block
also reaches a capturing call — resolving module-local helpers one level deep, as the other guards
here do.

It is a tripwire, not a proof:

- it proves a capture is REACHED in the catch, not that the right error object was passed to it;
- it only sees a message returned from the catch that caught it. Stashing the error in a variable and
  returning it two functions later is invisible.

**Shrink-only baseline:** `prisma/error-capture-baseline.json`, anchored on **file → count**, not
`file:line`. Line anchors churn — editing anything above a baselined catch shifts its line and the
guard reports a stale entry, so every unrelated change drags a baseline edit along and people stop
reading the diff. The tradeoff, stated plainly: fixing one site in a file while adding another leaves
the count equal and slips through. That is a narrow hole review catches; line churn is the failure
that actually erodes a guard's credibility. Lower a number when you fix one; never raise one.

The baseline opened at 34 sites across 24 files and stands at **16 across 6 files** — the 18 route
handlers were migrated to `routeError`/`cronError` in the same change. What remains is
`src/lib/weather/actions.ts` (9), `src/lib/ingest/ingest-invoice-core.ts` (3), and one each in
`action-result.ts`, `ferment/panel-core.ts`, `gis/satellite/process-scene-core.ts` and
`ingest/extract-invoice.ts`.

## Related

`cronAuthorized` in `src/lib/route-settle.ts` landed alongside this: the constant-time bearer gate had
been inlined identically in all 13 cron routes. Every copy was correct, which is what made the
duplication dangerous — nothing forced a 14th route to include one, and a cron endpoint without the
gate is an unauthenticated way to trigger a tenant-wide sweep.

See also [[REDIRECT-1]] (the opposite polarity: rethrow the FRAMEWORK's errors, catch your own) and
[[TENANT-1]].
