import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionError } from "@/lib/action-error";

/**
 * `settleWithCapture` — the three-way branch that fixes both halves of the old hand-rolled catch-all:
 * it leaked `e.message` to the browser AND sent nothing to Sentry.
 *
 * Both dependencies are mocked because neither can load in a node test env: `@sentry/nextjs` needs an
 * initialised client, and `next/navigation` pulls Next's client router context (the same failure that
 * forced `scope-core.ts` to exist).
 */

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException: (...a: unknown[]) => captureException(...a) }));

/** Stand-in for the real `unstable_rethrow`: rethrows framework errors, falls through for the rest. */
const NEXT_CONTROL_FLOW = "NEXT_REDIRECT";
vi.mock("next/navigation", () => ({
  unstable_rethrow: (e: unknown) => {
    if (e instanceof Error && e.message.startsWith(NEXT_CONTROL_FLOW)) throw e;
  },
}));

const { settleWithCapture } = await import("@/lib/action-settle");

const ctx = { action: "test.action", area: "test" };

beforeEach(() => captureException.mockClear());

describe("the happy path", () => {
  it("wraps the value", async () => {
    const r = await settleWithCapture(async () => 42, ctx);
    expect(r).toEqual({ ok: true, data: 42 });
    expect(captureException).not.toHaveBeenCalled();
  });
});

describe("an EXPECTED ActionError comes back verbatim", () => {
  it("returns the message and its code, and does NOT page anyone", async () => {
    const r = await settleWithCapture(async () => {
      throw new ActionError("You can only work with your assigned vineyard.", "FORBIDDEN");
    }, ctx);
    expect(r).toEqual({
      ok: false,
      error: "You can only work with your assigned vineyard.",
      code: "FORBIDDEN",
    });
    // A refusal is not a bug. Capturing it would bury the real ones in noise.
    expect(captureException).not.toHaveBeenCalled();
  });

  it("defaults to VALIDATION when no code is given", async () => {
    const r = await settleWithCapture(async () => {
      throw new ActionError("Enter a name.");
    }, ctx);
    expect(r).toMatchObject({ ok: false, code: "VALIDATION" });
  });
});

describe("an UNEXPECTED error is captured and NOT leaked", () => {
  it("sends it to Sentry with context", async () => {
    const boom = new Error('relation "spray_application" violates foreign key "spray_x_fkey"');
    const r = await settleWithCapture(async () => {
      throw boom;
    }, { action: "spray.withTenant", area: "spray", extra: { lotId: "abc" } });

    expect(captureException).toHaveBeenCalledTimes(1);
    const [err, opts] = captureException.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(err).toBe(boom);
    expect(opts).toMatchObject({
      tags: { action: "spray.withTenant", area: "spray" },
      extra: { lotId: "abc" },
    });
    expect(r).toMatchObject({ ok: false, code: "UNEXPECTED" });
  });

  it("does NOT put the underlying message in the response", async () => {
    // The whole point. A Prisma error names tables, columns and constraints; that text is written for
    // engineers and must not reach a browser.
    const r = await settleWithCapture(async () => {
      throw new Error('relation "spray_application" violates foreign key "spray_x_fkey"');
    }, ctx);
    if (r.ok) throw new Error("expected failure");
    expect(r.error).not.toContain("spray_application");
    expect(r.error).not.toContain("foreign key");
    expect(r.error).toMatch(/something went wrong/i);
  });

  it("captures a non-Error throw too (a string, a rejected object)", async () => {
    const r = await settleWithCapture(async () => {
      throw "just a string";
    }, ctx);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: false, code: "UNEXPECTED" });
  });
});

describe("framework control flow is NOT an error (REDIRECT-1)", () => {
  it("rethrows a redirect instead of turning it into a result", async () => {
    // The bug this ordering prevents: swallowing NEXT_REDIRECT strands the user on the page with
    // "NEXT_REDIRECT;replace;/login;307;" as their error message.
    await expect(
      settleWithCapture(async () => {
        throw new Error("NEXT_REDIRECT;replace;/login;307;");
      }, ctx),
    ).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("does not report a redirect to Sentry — it is not a failure", async () => {
    await settleWithCapture(async () => {
      throw new Error("NEXT_REDIRECT;replace;/login;307;");
    }, ctx).catch(() => {});
    expect(captureException).not.toHaveBeenCalled();
  });

  it("checks control flow BEFORE the ActionError branch", async () => {
    // Ordering matters: if the ActionError check ran first, a subclass carrying a redirect digest could
    // be settled as data. unstable_rethrow must see it first.
    const sneaky = new ActionError("NEXT_REDIRECT;replace;/login;307;");
    await expect(settleWithCapture(async () => { throw sneaky; }, ctx)).rejects.toThrow(/NEXT_REDIRECT/);
  });
});
